-- Cohort registration-open invariant (fixes the public "shows not open" false negative).
--
-- Root cause: "publicly open to register" = cohort.status='published' AND end_date>=today AND
-- registration_status IN ('register_now','live'). These were three independent gates across two
-- intentionally-orthogonal axes (publish status vs registration status, ADR-0061). The public
-- gateways filter to status='published' AND end_date>=today, so setting registration_status to
-- 'register_now' on a cohort that is NOT published (or is past its end_date) left the public detail
-- showing "not open" — a silent false negative, because the open cohort was filtered out before the
-- badge ran. Nothing reconciled the two axes, so the inconsistent state was reachable.
--
-- Fix (owner decision, 2026-11-25): enforce the invariant at the single write boundary. The
-- owner-or-admin RPC that is the ONLY writer of registration_status now REJECTS the register-open
-- states ('register_now','live') on a cohort that is not published with a future end_date. The
-- not-yet-open states ('coming_soon','finished') stay settable at any publish status. So the admin
-- can no longer "open enrollment" on a cohort that would not show as open publicly — they get a
-- clear error telling them to publish the cohort first, instead of a silent mismatch.
--
-- Expand-only (ADR-0026): CREATE OR REPLACE of the existing SECURITY DEFINER function; no schema or
-- contract change. Forward-only, hand-applied to prod (migrations are not run in CI). Supersedes the
-- "set at ANY publish status" latitude of 20260926120000 for the two OPEN states only.

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
  v_class uuid;
  v_old public.cohort_registration_status;
  v_publish_status public.cohort_status;
  v_end_date date;
BEGIN
  SELECT c.owner_user_id, co.class_id, co.registration_status, co.status, co.end_date
    INTO v_owner, v_class, v_old, v_publish_status, v_end_date
    FROM public.cohorts co
    JOIN public.classes c ON c.id = co.class_id
   WHERE co.id = p_cohort_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'cohort not found';
  END IF;

  IF NOT (v_owner = auth.uid() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized to set this cohort''s registration status';
  END IF;

  -- The invariant: the register-OPEN states are reachable ONLY on a cohort that would
  -- actually be publicly visible as open (published + not ended). This is what makes a
  -- public false negative ("I opened enrollment but it shows not open") structurally
  -- impossible — the open state cannot be stored on a cohort the public gateways would
  -- filter out. 'coming_soon' and 'finished' are unaffected (settable at any status).
  IF p_status IN ('register_now', 'live')
     AND NOT (v_publish_status = 'published' AND v_end_date >= current_date) THEN
    RAISE EXCEPTION
      'cannot set registration status to % on cohort %: it must be published with a future end date first (publish status is %, end date is %)',
      p_status, p_cohort_id, v_publish_status, v_end_date
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.cohorts
     SET registration_status = p_status,
         updated_at = now()
   WHERE id = p_cohort_id;

  INSERT INTO public.class_audit(
    entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason
  )
  VALUES (
    'cohort', p_cohort_id, v_class, auth.uid(), 'set_registration_status', v_old::text, p_status::text, NULL
  );
END$$;

-- Grants unchanged by CREATE OR REPLACE, re-asserted for clarity: authenticated only, owner-or-admin
-- gate inside. Never anon.
REVOKE ALL ON FUNCTION public.set_cohort_registration_status(uuid, public.cohort_registration_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cohort_registration_status(uuid, public.cohort_registration_status) TO authenticated;
