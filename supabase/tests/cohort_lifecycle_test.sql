-- pgTAP: the born-published cohort lifecycle + the registration-open invariant enforced at the TABLE
-- (ADR 20261126-cohorts-born-published). Run: `supabase db test`. Proves the structural floors:
--   * a new cohort is born 'published' with published_at set (no separate publish step);
--   * register_now/live is rejected on a draft or ended cohort by a RAW table UPDATE (not only the RPC),
--     and allowed on a published, future cohort;
--   * draft -> published is a legal single-step transition;
--   * submit_class_for_review refuses a non-draft class (the Submit bug, now impossible);
--   * an owner can edit their own PUBLISHED cohort (RLS widened).
-- Runs in a rolled-back txn.

BEGIN;
SELECT plan(11);

-- ── Fixtures (triggers off for deterministic setup; FKs valid) ──────────────────
SET session_replication_role = replica;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher@example.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (user_id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher@example.com')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher')
ON CONFLICT DO NOTHING;

-- A PUBLISHED class owned by the teacher.
INSERT INTO public.classes (id, owner_user_id, track, title, slug, summary, status)
VALUES ('11111111-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'basic_training', 'Lifecycle Test Class', 'lifecycle-test-class',
        'A class for the cohort-lifecycle pgTAP suite.', 'published');

-- Draft cohort A (invariant-reject), draft cohort B (publish test), published-future C, published-ended D.
INSERT INTO public.cohorts (id, class_id, label, start_date, end_date, timezone, registration_url, status, registration_status)
VALUES
  ('88888888-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
   'Draft A', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/register', 'draft', 'coming_soon'),
  ('99999999-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
   'Draft B', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/register', 'draft', 'coming_soon'),
  ('55555555-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
   'Published Future C', CURRENT_DATE, CURRENT_DATE + 30, 'UTC', 'https://example.com/register', 'published', 'coming_soon'),
  ('77777777-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
   'Published Ended D', CURRENT_DATE - 60, CURRENT_DATE - 1, 'UTC', 'https://example.com/register', 'published', 'coming_soon'),
  -- E: validly opened then time elapsed — 'live' AND ended. The gateway hides it; it must stay EDITABLE
  -- (the invariant gates the transition INTO open, not the steady state) — a stored value true when
  -- written is not a false store.
  ('e0e0e0e0-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
   'Live Then Ended E', CURRENT_DATE - 60, CURRENT_DATE - 1, 'UTC', 'https://example.com/register', 'published', 'live');

SET session_replication_role = default;

-- ── 1-2. Born published: a cohort inserted with no explicit status is published, with published_at set ──
INSERT INTO public.cohorts (id, class_id, label, start_date, end_date, timezone, registration_url)
VALUES ('b0b0b0b0-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000',
        'Born Published', CURRENT_DATE + 1, CURRENT_DATE + 40, 'UTC', 'https://example.com/register');
SELECT is(
  (SELECT status::text FROM public.cohorts WHERE id = 'b0b0b0b0-0000-0000-0000-000000000000'),
  'published', 'a new cohort is born published (no separate publish step)');
SELECT isnt(
  (SELECT published_at FROM public.cohorts WHERE id = 'b0b0b0b0-0000-0000-0000-000000000000'),
  NULL, 'published_at is auto-set on a born-published cohort');

-- ── 3. The invariant at the TABLE: a raw UPDATE cannot open registration on a draft cohort ──
SELECT throws_ok(
  $$ UPDATE public.cohorts SET registration_status = 'register_now' WHERE id = '88888888-0000-0000-0000-000000000000' $$,
  '23514', NULL,
  'a RAW table UPDATE cannot set register_now on a draft cohort (invariant is at the table, not just the RPC)');

-- ── 4. …but it IS allowed on a published, future cohort ──
SELECT lives_ok(
  $$ UPDATE public.cohorts SET registration_status = 'register_now' WHERE id = '55555555-0000-0000-0000-000000000000' $$,
  'a raw UPDATE can open registration on a published, future-dated cohort');

-- ── 5-6. draft -> published is a legal single-step transition, and sets published_at ──
SELECT lives_ok(
  $$ UPDATE public.cohorts SET status = 'published' WHERE id = '99999999-0000-0000-0000-000000000000' $$,
  'draft -> published is a legal single-step transition (born-published model)');
SELECT isnt(
  (SELECT published_at FROM public.cohorts WHERE id = '99999999-0000-0000-0000-000000000000'),
  NULL, 'published_at is set when a draft cohort is published');

-- ── 7. register_now on an ENDED published cohort is rejected (end_date gate) ──
SELECT throws_ok(
  $$ UPDATE public.cohorts SET registration_status = 'register_now' WHERE id = '77777777-0000-0000-0000-000000000000' $$,
  '23514', NULL,
  'a raw UPDATE cannot open registration on a cohort whose end_date has passed');

-- ── 8. submit_class_for_review refuses a non-draft class (the Submit bug, now structurally impossible) ──
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.submit_class_for_review('11111111-0000-0000-0000-000000000000', '{}') $$,
  '23514', NULL,
  'cannot submit an already-published class for review (the cohort Submit crash is now impossible)');
RESET ROLE;

-- ── 9. An owner can edit their own PUBLISHED cohort (RLS widened from draft-only) ──
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT lives_ok(
  $$ UPDATE public.cohorts SET label = 'Edited Label' WHERE id = '55555555-0000-0000-0000-000000000000' $$,
  'an owner can edit their own published cohort (RLS no longer restricts to draft)');
RESET ROLE;

-- ── 10. No lockout: a 'live' cohort whose end_date has passed stays editable (the invariant gates the
--        transition into open, not an unrelated edit of a row that was validly opened before). ──
SELECT lives_ok(
  $$ UPDATE public.cohorts SET label = 'Renamed' WHERE id = 'e0e0e0e0-0000-0000-0000-000000000000' $$,
  'a live-then-ended cohort can still be edited (registration_status unchanged, so the invariant does not refire)');

-- ── 11. The audit trigger captures a registration change made by a RAW table UPDATE (not just the RPC).
--        Cohort C was opened to register_now by a raw UPDATE in test 4; that must be in class_audit. ──
SELECT is(
  (SELECT count(*)::int FROM public.class_audit
    WHERE entity_type = 'cohort'
      AND entity_id = '55555555-0000-0000-0000-000000000000'
      AND action = 'set_registration_status'
      AND to_status = 'register_now'),
  1, 'a raw UPDATE of registration_status is audited by trg_cohort_registration_audit (no write path escapes the audit)');

SELECT * FROM finish();
ROLLBACK;
