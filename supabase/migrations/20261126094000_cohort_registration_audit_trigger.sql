-- Make the class_audit row for a registration_status change a DB-owned invariant (ADR 20261126,
-- closing judge-arch Finding 2). Until now set_cohort_registration_status wrote the audit row itself, so
-- a registration_status change made by any OTHER write path (e.g. an owner's direct table UPDATE, now
-- possible after the UPDATE-policy widening in 20261126091000) left NO audit trail. The audit becomes a
-- single DB trigger that fires on EVERY registration_status change, from any writer — so "who opened/closed
-- this cohort and when" can never silently miss a write. The RPC stops writing its own audit row (the
-- trigger now owns it) to avoid double-counting.
--
-- Ordering: this is applied AFTER the backfill (20261126093000), which keeps its own descriptive audit
-- insert (that migration runs before this trigger exists, so there is no double write for it).
--
-- Expand-only: a new trigger + function, and a same-signature CREATE OR REPLACE of the RPC that only
-- REMOVES its now-duplicate audit insert (the guard + authorization are unchanged). Forward-only,
-- hand-applied, idempotent.

-- 1. The single audit writer for registration_status changes.
CREATE OR REPLACE FUNCTION public.cohort_registration_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.class_audit(
    entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason
  )
  VALUES (
    'cohort', NEW.id, NEW.class_id, auth.uid(), 'set_registration_status',
    OLD.registration_status::text, NEW.registration_status::text, NULL
  );
  RETURN NULL;
END$$;

DROP TRIGGER IF EXISTS trg_cohort_registration_audit ON public.cohorts;
CREATE TRIGGER trg_cohort_registration_audit
AFTER UPDATE ON public.cohorts
FOR EACH ROW
WHEN (OLD.registration_status IS DISTINCT FROM NEW.registration_status)
EXECUTE FUNCTION public.cohort_registration_audit();

-- 2. The RPC no longer writes its own audit row (the trigger owns it). Guard + authorization unchanged.
CREATE OR REPLACE FUNCTION public.set_cohort_registration_status(
  p_cohort_id uuid,
  p_status public.cohort_registration_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_publish_status public.cohort_status;
  v_end_date date;
BEGIN
  SELECT c.owner_user_id, co.status, co.end_date
    INTO v_owner, v_publish_status, v_end_date
    FROM public.cohorts co
    JOIN public.classes c ON c.id = co.class_id
   WHERE co.id = p_cohort_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'cohort not found';
  END IF;

  IF NOT (v_owner = auth.uid() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized to set this cohort''s registration status';
  END IF;

  -- Friendlier-message copy of the invariant; the cohorts_validate TABLE trigger (20261126090000) is
  -- the real floor and enforces this for every write path, raw UPDATE included.
  IF p_status IN ('register_now', 'live')
     AND NOT (v_publish_status = 'published' AND v_end_date >= current_date) THEN
    RAISE EXCEPTION
      'cannot set registration status to % on cohort %: it must be published with a future end date first (publish status is %, end date is %)',
      p_status, p_cohort_id, v_publish_status, v_end_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The audit row is written by trg_cohort_registration_audit (single writer, all paths).
  UPDATE public.cohorts
     SET registration_status = p_status,
         updated_at = now()
   WHERE id = p_cohort_id;
END$$;

REVOKE ALL ON FUNCTION public.set_cohort_registration_status(uuid, public.cohort_registration_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cohort_registration_status(uuid, public.cohort_registration_status) TO authenticated;
