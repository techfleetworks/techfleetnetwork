-- Cohorts are born published (ADR 20261126-cohorts-born-published).
--
-- A cohort no longer has its own draft -> pending_review -> published approval flow. Approval belongs
-- to the CLASS; a cohort under a published class is visible the moment it exists, and its only
-- public-facing lifecycle is registration_status (Coming Soon / Register Now / Live / Finished). So the
-- status column now DEFAULTs to 'published' instead of 'draft'. Visibility is still gated by the parent
-- class being published (RLS "Public can view published cohorts of published classes" + the gateways),
-- so admin review still happens once, at the class level — a born-published cohort on a draft class
-- stays hidden until the class is approved.
--
-- Because cohorts are now born published, the teacher UPDATE policy (which only allowed editing
-- draft|pending_review cohorts) would lock owners out of their own cohorts. Widen it to the owner's
-- cohorts at ANY status. The DB triggers remain the real guards: an owner still cannot un-publish
-- (no published->draft transition), cannot store a false "open" (the table invariant from
-- 20261126090000), and cannot set a non-https registration_url. WITH CHECK pins class_id ownership so a
-- cohort can't be re-parented to a class the owner doesn't own.
--
-- Expand-only (ADR-0026): a DEFAULT change (affects only new rows; existing rows and old code that sets
-- status explicitly are unaffected) and an RLS policy swap. Forward-only, hand-applied, idempotent.

-- 1. New cohorts default to published.
ALTER TABLE public.cohorts ALTER COLUMN status SET DEFAULT 'published';

-- 2. Owners may edit their own cohorts regardless of publish status (triggers enforce the invariants).
DROP POLICY IF EXISTS "Teachers can edit their draft cohorts" ON public.cohorts;
DROP POLICY IF EXISTS "Teachers can edit their cohorts" ON public.cohorts;
CREATE POLICY "Teachers can edit their cohorts" ON public.cohorts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.owner_user_id = auth.uid())
  );
