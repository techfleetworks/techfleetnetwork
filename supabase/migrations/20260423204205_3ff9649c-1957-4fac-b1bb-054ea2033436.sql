
-- Temporarily disable append-only enforcement for this one-time backfill
DROP TRIGGER IF EXISTS trg_block_audit_mutation ON public.audit_log;

-- Backfill audit_log
DO $$
DECLARE
  v_prev text := NULL;
  r record;
  v_payload text;
  v_new_hash text;
BEGIN
  FOR r IN
    SELECT id, row_to_json(t.*) AS j
      FROM public.audit_log t
     ORDER BY created_at ASC, id ASC
  LOOP
    v_payload := COALESCE(v_prev, '') || '|' || ((r.j::jsonb) - 'row_hash' - 'prev_hash')::text;
    v_new_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    UPDATE public.audit_log
       SET prev_hash = v_prev,
           row_hash  = v_new_hash
     WHERE id = r.id;
    v_prev := v_new_hash;
  END LOOP;
END $$;

-- Backfill admin_promotions
DO $$
DECLARE
  v_prev text := NULL;
  r record;
  v_payload text;
  v_new_hash text;
BEGIN
  FOR r IN
    SELECT id, row_to_json(t.*) AS j
      FROM public.admin_promotions t
     ORDER BY created_at ASC, id ASC
  LOOP
    v_payload := COALESCE(v_prev, '') || '|' || ((r.j::jsonb) - 'row_hash' - 'prev_hash')::text;
    v_new_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
    UPDATE public.admin_promotions
       SET prev_hash = v_prev,
           row_hash  = v_new_hash
     WHERE id = r.id;
    v_prev := v_new_hash;
  END LOOP;
END $$;

-- Update the chain trigger and verifier to use the same payload formula
-- (excluding both row_hash AND prev_hash from the payload, matching backfill)
CREATE OR REPLACE FUNCTION public.tg_hash_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_prev text;
  v_payload text;
BEGIN
  EXECUTE format('SELECT row_hash FROM public.%I ORDER BY created_at DESC, id DESC LIMIT 1', TG_TABLE_NAME)
    INTO v_prev;
  NEW.prev_hash := v_prev;
  v_payload := COALESCE(v_prev, '') || '|' || ((row_to_json(NEW)::jsonb) - 'row_hash' - 'prev_hash')::text;
  NEW.row_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_table text DEFAULT 'audit_log')
RETURNS TABLE(broken_id uuid, broken_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev text := NULL;
  v_expected text;
  r record;
BEGIN
  IF p_table NOT IN ('audit_log','admin_promotions') THEN
    RAISE EXCEPTION 'verify_audit_chain only supports audit_log or admin_promotions';
  END IF;
  FOR r IN EXECUTE format(
    'SELECT id, created_at, prev_hash, row_hash, row_to_json(t.*) AS j FROM public.%I t ORDER BY created_at ASC, id ASC',
    p_table
  ) LOOP
    v_expected := encode(
      extensions.digest(COALESCE(v_prev, '') || '|' || ((r.j::jsonb) - 'row_hash' - 'prev_hash')::text, 'sha256'),
      'hex'
    );
    IF r.row_hash IS NULL OR r.row_hash <> v_expected THEN
      broken_id := r.id;
      broken_at := r.created_at;
      RETURN NEXT;
      RETURN;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
END;
$$;

-- Re-enable append-only enforcement
CREATE TRIGGER trg_block_audit_mutation
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_mutation();
