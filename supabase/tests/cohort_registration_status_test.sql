-- pgTAP: cohort registration_status column + set_cohort_registration_status() authorization (ADR-0061).
-- Run: `supabase db test`. Proves registration_status exists as the right shape and that the write
-- path (set_cohort_registration_status) is owner-or-admin ONLY, and works on a PUBLISHED cohort --
-- the case the table RLS forbids for owners (it limits owner UPDATE to draft|pending_review). Attacks
-- the RPC as each role: owner-teacher, other-teacher, admin, outsider. Runs in a rolled-back txn.

BEGIN;
SELECT plan(12);

-- ── Column shape ───────────────────────────────────────────────────────────────
SELECT has_column('public', 'cohorts', 'registration_status', 'cohorts.registration_status exists');
SELECT col_type_is('public', 'cohorts', 'registration_status', 'cohort_registration_status', 'registration_status is cohort_registration_status');
SELECT col_not_null('public', 'cohorts', 'registration_status', 'registration_status is NOT NULL');
SELECT col_default_is('public', 'cohorts', 'registration_status', 'coming_soon', 'registration_status defaults coming_soon');

-- The cohort read paths are the `authenticated` role via cohorts.select('*'); a hidden column would
-- read undefined and the badge/dropdown would silently break.
SELECT ok(
  has_column_privilege('authenticated', 'public.cohorts', 'registration_status', 'SELECT'),
  'authenticated can SELECT cohorts.registration_status (cohort read path)'
);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Disable validation/slug triggers for deterministic setup; FKs are all valid.
SET session_replication_role = replica;

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

-- Class C owned by T; a PUBLISHED cohort (the case owners cannot UPDATE under table RLS).
INSERT INTO public.classes (id, owner_user_id, track, title, slug, summary, status)
VALUES ('11111111-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'basic_training', 'Test Class', 'test-class-cohort-registration-status',
        'A test class used by the cohort registration-status pgTAP suite.', 'published');

INSERT INTO public.cohorts (id, class_id, label, start_date, end_date, timezone, registration_url, status, registration_status)
VALUES ('55555555-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
        'Cohort 1', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/register',
        'published', 'coming_soon');

SET session_replication_role = default;

-- ── Authorization (attack the RPC as each role) ────────────────────────────────
-- 6. The owner-teacher CAN set the registration status on a PUBLISHED cohort (the whole point).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.set_cohort_registration_status('55555555-0000-0000-0000-000000000000', 'live') $$,
  'owner can set registration_status on a published cohort (post-publication path)');
RESET ROLE;

-- 7. …and it actually changed.
SELECT is(
  (SELECT registration_status::text FROM public.cohorts WHERE id = '55555555-0000-0000-0000-000000000000'),
  'live', 'registration_status was updated to live');

-- 8. A different teacher (not the owner) CANNOT.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.set_cohort_registration_status('55555555-0000-0000-0000-000000000000', 'finished') $$,
  'P0001', NULL, 'a non-owner teacher cannot set the registration status');
RESET ROLE;

-- 9. An admin CAN.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.set_cohort_registration_status('55555555-0000-0000-0000-000000000000', 'finished') $$,
  'an admin can set the registration status of any cohort');
RESET ROLE;

-- 10. An unrelated outsider CANNOT.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.set_cohort_registration_status('55555555-0000-0000-0000-000000000000', 'live') $$,
  'P0001', NULL, 'an outsider cannot set the registration status');
RESET ROLE;

-- 11. An unknown cohort id is rejected (not a silent no-op).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.set_cohort_registration_status('99999999-0000-0000-0000-000000000000', 'live') $$,
  'P0001', NULL, 'a missing cohort raises rather than silently doing nothing');
RESET ROLE;

-- 12. Each successful set wrote a class_audit row (owner set + admin set = 2).
SELECT is(
  (SELECT count(*)::int FROM public.class_audit
    WHERE entity_type = 'cohort'
      AND entity_id = '55555555-0000-0000-0000-000000000000'
      AND action = 'set_registration_status'),
  2, 'each registration-status change is recorded in class_audit');

SELECT * FROM finish();
ROLLBACK;
