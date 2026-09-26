-- Cohort registration-status (ADR-0061): the learner-facing lifecycle of a cohort's run, distinct
-- from the PUBLISH status (classes.status / cohorts.status: draft -> pending_review -> published ->
-- archived/cancelled, the teacher/admin approval workflow). registration_status answers "where is
-- this cohort in its public timeline?" -- Coming Soon -> Register Now -> Live -> Finished -- and is
-- set on the COHORT by the class owner or an admin at ANY publish status.
--
-- Two orthogonal axes, kept separate on purpose:
--   * Publish Status  (existing status column) -- the approval workflow; managed at the class level.
--   * Registration Status (this column)        -- the run lifecycle; set per cohort.
--
-- Expand-only (ADR-0026): a new enum + an additive column (NOT NULL DEFAULT, so existing rows and
-- still-running old inserts are safe) + a new SECURITY DEFINER setter. No contract here. Safe to
-- apply BEFORE the UI that reads it ships, and safe to leave applied if that UI rolls back.
--
-- Authorization note: under the table RLS an owner can only UPDATE a cohort while it is
-- draft|pending_review ("Teachers can edit their draft cohorts"); once published, only an admin can
-- write it directly. But registration_status must be settable AFTER publication -- that is exactly
-- when a cohort goes Live and then Finished. So the write path is a SECURITY DEFINER RPC that checks
-- owner-or-admin and touches ONLY registration_status -- never a widened table UPDATE policy, which
-- would also let owners edit every other field on a published cohort.

-- 1) Enum for the four registration statuses.
DO $$ BEGIN
  CREATE TYPE public.cohort_registration_status AS ENUM ('coming_soon', 'register_now', 'live', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Additive column. The DEFAULT backfills existing rows and covers old inserts that omit it (ADR-0026).
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS registration_status public.cohort_registration_status NOT NULL DEFAULT 'coming_soon';

COMMENT ON COLUMN public.cohorts.registration_status IS
  'Learner-facing registration lifecycle (coming_soon -> register_now -> live -> finished), distinct from status (the publish/approval workflow). Set by the owning teacher or an admin via set_cohort_registration_status() at any publish status. Defaults coming_soon (ADR-0061).';

-- No column GRANT needed: unlike public.projects (column-scoped for authenticated, ADR-0056),
-- public.cohorts still holds table-level SELECT for authenticated (only meeting_url is revoked from
-- anon, 20260513041024), so registration_status is auto-readable on the existing cohort read paths.

-- 3) The single write path for registration_status: owner-or-admin, only touches registration_status,
--    works at any publish status. Mirrors submit_class_for_review (owner check) + the admin RPCs
--    (has_role) and writes class_audit like every other class/cohort mutation (20260502160222).
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
BEGIN
  SELECT c.owner_user_id, co.class_id, co.registration_status
    INTO v_owner, v_class, v_old
    FROM public.cohorts co
    JOIN public.classes c ON c.id = co.class_id
   WHERE co.id = p_cohort_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'cohort not found';
  END IF;

  IF NOT (v_owner = auth.uid() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized to set this cohort''s registration status';
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

-- Callable by signed-in users only; the owner-or-admin check inside is the gate. Never anon.
REVOKE ALL ON FUNCTION public.set_cohort_registration_status(uuid, public.cohort_registration_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cohort_registration_status(uuid, public.cohort_registration_status) TO authenticated;
