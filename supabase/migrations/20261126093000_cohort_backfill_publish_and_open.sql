-- One-shot: bring existing cohorts into the born-published model AND the owner-requested open state.
--
-- Context: the owner's instruction is that all current classes should be open to register ("Register
-- Now"). Before the born-published model (ADR 20261126), the live classes' cohorts were stuck 'draft'
-- (the redundant second-publish step), so the public pages read "not open". This migration, applied
-- after the invariant trigger (20261126090000) and the default/RLS change (20261126091000), fixes the
-- existing data to match both the new model and the instruction:
--   * Only cohorts whose PARENT CLASS is published and whose end_date is today-or-later are touched
--     (an ended cohort stays closed; a cohort of an archived/draft class is not surfaced).
--   * Those cohorts are set status='published' (draft/pending_review -> published is now a legal,
--     single-step transition) and registration_status='register_now' in one write, so the row is never
--     in an inconsistent intermediate state and the table invariant (20261126090000) validates it.
--   * Already-open cohorts are skipped (idempotent: re-running matches nothing).
-- Audited in class_audit (actor NULL = system/manual action), mirroring the RPC write shape.
--
-- Editorial, forward-only, hand-applied. The owner can set any cohort back to Coming Soon in the UI.

WITH target AS (
  SELECT c.id, c.class_id, c.registration_status AS old_reg
    FROM public.cohorts c
    JOIN public.classes cl ON cl.id = c.class_id
   WHERE cl.status = 'published'
     AND c.end_date >= current_date
     AND c.status IN ('draft', 'pending_review', 'published')   -- never archived/cancelled
     AND (c.status <> 'published' OR c.registration_status NOT IN ('register_now', 'live'))
),
updated AS (
  UPDATE public.cohorts c
     SET status = 'published',
         registration_status = 'register_now'
    FROM target t
   WHERE c.id = t.id
  RETURNING c.id
)
INSERT INTO public.class_audit (
  entity_type, entity_id, class_id, actor_user_id, action, from_status, to_status, reason
)
SELECT
  'cohort', t.id, t.class_id, NULL, 'set_registration_status',
  t.old_reg::text, 'register_now',
  'one-shot backfill: publish + open registration on live-class cohorts (migration 20261126093000, ADR 20261126-cohorts-born-published)'
FROM target t;

-- Verify the instruction held: no cohort of a published class, still in its window, is left closed.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.cohorts c
    JOIN public.classes cl ON cl.id = c.class_id
   WHERE cl.status = 'published'
     AND c.end_date >= current_date
     AND c.status NOT IN ('archived', 'cancelled')
     AND c.registration_status NOT IN ('register_now', 'live');
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'backfill left % live-class cohort(s) not open to register', v_remaining;
  END IF;
  RAISE NOTICE 'cohort publish+open backfill complete — every live-class cohort is open to register';
END $$;
