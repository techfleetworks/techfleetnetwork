ALTER TABLE public.agent_fix_queue
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agent_fix_queue_snoozed
  ON public.agent_fix_queue (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

-- Promote a queue entry's fingerprint to the silence list, dismiss it, and
-- mark dismissed_reason. Admin-only (RLS on agent_fix_queue + has_role check).
CREATE OR REPLACE FUNCTION public.promote_fingerprint_to_known(
  p_fix_queue_id UUID,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fp TEXT;
  v_uid UUID := auth.uid();
  v_kic_id UUID;
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT fingerprint INTO v_fp
  FROM public.agent_fix_queue
  WHERE id = p_fix_queue_id;
  IF v_fp IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  INSERT INTO public.known_issue_catalog (pattern, match_kind, reason, accepted_by)
  VALUES (v_fp, 'fingerprint', left(p_reason, 500), v_uid)
  ON CONFLICT (pattern, match_kind, event_type_filter)
  DO UPDATE SET is_active = true, reason = EXCLUDED.reason, accepted_by = v_uid, accepted_at = now()
  RETURNING id INTO v_kic_id;

  UPDATE public.agent_fix_queue
     SET status = 'dismissed',
         dismissed_at = now(),
         dismissed_by = v_uid,
         dismissed_reason = left(p_reason, 500),
         updated_at = now()
   WHERE id = p_fix_queue_id;

  RETURN v_kic_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_fingerprint_to_known(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_fingerprint_to_known(UUID, TEXT) TO authenticated;

-- Snooze RPC
CREATE OR REPLACE FUNCTION public.snooze_fix_queue_entry(
  p_id UUID,
  p_days INT DEFAULT 7
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.agent_fix_queue
     SET snoozed_until = now() + make_interval(days => greatest(p_days, 1)),
         updated_at = now()
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.snooze_fix_queue_entry(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snooze_fix_queue_entry(UUID, INT) TO authenticated;

-- 90-day archive
CREATE OR REPLACE FUNCTION public.archive_old_fix_queue()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n INT;
BEGIN
  WITH del AS (
    DELETE FROM public.agent_fix_queue
     WHERE status IN ('resolved','dismissed')
       AND COALESCE(resolved_at, dismissed_at, updated_at) < now() - interval '90 days'
     RETURNING 1
  )
  SELECT count(*) INTO v_n FROM del;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_old_fix_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_old_fix_queue() TO service_role;