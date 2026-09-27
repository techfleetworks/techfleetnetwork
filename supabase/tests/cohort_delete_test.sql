-- pgTAP: delete_cohort() authorization + safety (ADR-0063). Run: `supabase db test`.
-- Proves the owner-or-admin SECURITY DEFINER delete path:
--   * a class owner (teacher) can delete THEIR OWN cohort; a different teacher / outsider cannot.
--   * an admin caller must present fresh 2FA (aal2) — without it the delete is refused (42501).
--   * safety: an empty, unpublished cohort is hard-deleted; a cohort that has registrations OR is
--     published is soft-cancelled (status -> cancelled) and its registrations are preserved.
--   * every delete writes a class_audit row.
-- Runs in a rolled-back txn.

BEGIN;
SELECT plan(12);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
SET session_replication_role = replica; -- bypass validation/slug triggers; FKs stay valid.

-- T=owner-teacher, O=other-teacher, A=admin, X=outsider.
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'other-teacher@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@example.com'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'outsider@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'other-teacher@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@example.com'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'outsider@example.com')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'teacher'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin')
ON CONFLICT DO NOTHING;

-- Class C1 owned by T (published), Class C2 owned by O (published).
INSERT INTO public.classes (id, owner_user_id, track, title, slug, summary, status) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'basic_training', 'T Class', 'delete-cohort-test-class-t',
   'Owner-teacher class for the delete_cohort pgTAP suite.', 'published'),
  ('11111111-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'basic_training', 'O Class', 'delete-cohort-test-class-o',
   'Other-teacher class for the delete_cohort pgTAP suite.', 'published');

INSERT INTO public.cohorts (id, class_id, label, start_date, end_date, timezone, registration_url, status) VALUES
  -- empty draft owned by T -> hard delete
  ('55550000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Draft Empty', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/r', 'draft'),
  -- draft WITH a registration owned by T -> soft cancel
  ('55550000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Draft With Reg', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/r', 'draft'),
  -- published, empty owned by T -> soft cancel (live to learners)
  ('55550000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Published Empty', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/r', 'published'),
  -- empty draft owned by O -> used for admin cases
  ('55550000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002',
   'For Admin', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/r', 'draft'),
  -- empty draft owned by T -> used for other-teacher / outsider denial
  ('55550000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'For Other', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/r', 'draft');

-- A registration on the "Draft With Reg" cohort.
INSERT INTO public.cohort_registrations (cohort_id, user_id) VALUES
  ('55550000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

SET session_replication_role = default;

-- ── Owner (teacher, no admin, no aal2 required) ────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- 1. Owner hard-deletes an empty draft.
SELECT is(
  public.delete_cohort('55550000-0000-0000-0000-000000000001'),
  'deleted', 'owner hard-deletes an empty, unpublished cohort');

-- 2. It is gone.
SELECT is(
  (SELECT count(*)::int FROM public.cohorts WHERE id = '55550000-0000-0000-0000-000000000001'),
  0, 'the hard-deleted cohort no longer exists');

-- 4. Owner "deletes" a cohort that has a registration -> soft cancel.
SELECT is(
  public.delete_cohort('55550000-0000-0000-0000-000000000002'),
  'cancelled', 'a cohort with registrations is soft-cancelled, not destroyed');

-- 5. It still exists, marked cancelled.
SELECT is(
  (SELECT status::text FROM public.cohorts WHERE id = '55550000-0000-0000-0000-000000000002'),
  'cancelled', 'the soft-cancelled cohort is kept with status = cancelled');

-- 6. Its registration is preserved.
SELECT is(
  (SELECT count(*)::int FROM public.cohort_registrations WHERE cohort_id = '55550000-0000-0000-0000-000000000002'),
  1, 'registrations on a soft-cancelled cohort are preserved');

-- 7. Owner "deletes" a published (empty) cohort -> soft cancel (live to learners).
SELECT is(
  public.delete_cohort('55550000-0000-0000-0000-000000000003'),
  'cancelled', 'a published cohort is soft-cancelled rather than hard-deleted');
RESET ROLE;

-- ── Other teacher / outsider are denied ────────────────────────────────────────
-- 3. A different teacher cannot delete T's cohort.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.delete_cohort('55550000-0000-0000-0000-000000000005') $$,
  'P0001', NULL, 'a non-owner teacher cannot delete the cohort');
RESET ROLE;

-- 10. An unrelated outsider cannot.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.delete_cohort('55550000-0000-0000-0000-000000000005') $$,
  'P0001', NULL, 'an outsider cannot delete the cohort');
RESET ROLE;

-- ── Admin requires fresh 2FA (aal2) ────────────────────────────────────────────
-- 8. Admin WITHOUT aal2 is refused.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.delete_cohort('55550000-0000-0000-0000-000000000004') $$,
  '42501', NULL, 'an admin without fresh 2FA (aal2) is refused');
RESET ROLE;

-- 9. Admin WITH aal2 can delete any cohort.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated","aal":"aal2"}';
SELECT is(
  public.delete_cohort('55550000-0000-0000-0000-000000000004'),
  'deleted', 'an admin with aal2 deletes an empty cohort owned by another teacher');

-- 11. An unknown cohort id raises rather than silently no-op.
SELECT throws_ok(
  $$ SELECT public.delete_cohort('99999999-0000-0000-0000-000000000000') $$,
  'P0001', NULL, 'a missing cohort raises');
RESET ROLE;

-- 12. Each successful delete wrote a class_audit row (T: hard + soft + published-soft; A: hard = 4).
SELECT is(
  (SELECT count(*)::int FROM public.class_audit
    WHERE entity_type = 'cohort' AND action = 'delete_cohort'),
  4, 'every delete (hard or soft) is recorded in class_audit');

SELECT * FROM finish();
ROLLBACK;
