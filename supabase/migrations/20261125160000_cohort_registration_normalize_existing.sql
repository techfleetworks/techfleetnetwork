-- One-shot cleanup: normalize EXISTING cohorts that violate the registration-open invariant.
--
-- The write guard in 20261125150000 (ADR 20261125-cohort-registration-open-invariant) only governs
-- FUTURE writes. Rows set to an OPEN registration status ('register_now'/'live') before it shipped,
-- on a cohort that is NOT published-and-current, still exist. The public gateways already filter those
-- cohorts out (status='published' AND end_date>=today), so they read "not open" to a visitor — the
-- exact false-negative symptom — but their stored status disagrees with their effective public state.
--
-- This normalizes those rows so the stored state matches reality and the invariant holds for existing
-- data too:
--   * ended   (end_date < today)        -> 'finished'
--   * not-yet (published gate not met)  -> 'coming_soon'
-- No user-visible behavior change: these cohorts already showed "not open"; this only corrects the
-- stored value so the admin sees the truth and nothing re-asserts a false "open".
--
-- Safe + idempotent: touches ONLY registration_status (the validation trigger auto-sets updated_at and
-- its status-transition check is skipped because `status` is unchanged); re-running is a no-op once the
-- WHERE clause no longer matches. One concern per migration (the guard was 20261125150000); this is the
-- data backfill. Hand-applied to prod after merge. It applies the SAME predicate the write guard enforces
-- (and whose pgTAP lives in cohort_registration_status_test.sql), inverted.

WITH to_fix AS (
  SELECT
    c.id,
    c.class_id,
    c.registration_status AS old_status,
    CASE
      WHEN c.end_date < current_date THEN 'finished'::public.cohort_registration_status
      ELSE 'coming_soon'::public.cohort_registration_status
    END AS new_status
  FROM public.cohorts c
  WHERE c.registration_status IN ('register_now', 'live')
    AND NOT (c.status = 'published' AND c.end_date >= current_date)
),
updated AS (
  UPDATE public.cohorts c
     SET registration_status = tf.new_status
    FROM to_fix tf
   WHERE c.id = tf.id
  RETURNING c.id
)
-- Audit each correction as a system action (actor_user_id NULL), same shape as the RPC writes, so the
-- change is traceable in class_audit rather than silent.
INSERT INTO public.class_audit (
  entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason
)
SELECT
  'cohort', tf.id, tf.class_id, NULL, 'set_registration_status',
  tf.old_status::text, tf.new_status::text,
  'one-shot normalization: open registration on a non-published/ended cohort (migration 20261125160000, ADR 20261125-cohort-registration-open-invariant)'
FROM to_fix tf;

DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.cohorts
   WHERE registration_status IN ('register_now', 'live')
     AND NOT (status = 'published' AND end_date >= current_date);
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'normalization left % violating cohort row(s)', v_remaining;
  END IF;
  RAISE NOTICE 'cohort registration normalization complete — 0 violating rows remain';
END $$;
