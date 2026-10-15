-- pgTAP: Welcome Flow PR1 DB surface (ADR 20261009-welcome-flow-data-model / -gate / -eo-extension).
-- Run: `supabase db test`. Proves:
--   * profiles.welcome_flow_completed_at exists, is timestamptz, and is nullable (NULL = gate the flow);
--   * mark_welcome_flow_complete() is self-scoped (auth.uid()), rejects the unauthenticated caller,
--     and is SET-ONCE (a second/replay call never moves the original timestamp);
--   * get_welcome_flow_completion_count() is LIVE-derived and excludes test accounts + incomplete users
--     (ADR-0050 — no stored counter);
--   * set_my_marketing_subscription accepts the new 'welcome_flow' source (ADR 20261009-welcome-flow-eo-extension).
-- Runs in a rolled-back txn.

BEGIN;
SELECT plan(12);

-- ── Column shape ────────────────────────────────────────────────────────────────
SELECT has_column('public', 'profiles', 'welcome_flow_completed_at', 'profiles.welcome_flow_completed_at exists');
SELECT col_type_is('public', 'profiles', 'welcome_flow_completed_at', 'timestamp with time zone', 'it is timestamptz');

-- ── Fixtures ─────────────────────────────────────────────────────────────────────
-- Disable validation/slug triggers for deterministic setup.
SET session_replication_role = replica;

-- U1/U2 = real completers; U3 = a TEST account that completes; U4 = a real user who never completes.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'u1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'u3-test@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'u4@example.com')
ON CONFLICT (id) DO NOTHING;

-- U4 is inserted WITHOUT welcome_flow_completed_at — proving the column is nullable (no default,
-- no NOT NULL). is_test_account marks U3 as a test account to be excluded from the live count.
INSERT INTO public.profiles (user_id, email, is_test_account) VALUES
  ('11111111-1111-1111-1111-111111111111', 'u1@example.com', false),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.com', false),
  ('33333333-3333-3333-3333-333333333333', 'u3-test@example.com', true),
  ('44444444-4444-4444-4444-444444444444', 'u4@example.com', false)
ON CONFLICT (user_id) DO NOTHING;

SET session_replication_role = default;

-- ── mark_welcome_flow_complete() — unauthenticated is rejected ─────────────────────
-- No role / no jwt claims ⇒ auth.uid() is NULL ⇒ must raise, never silently complete someone.
SELECT throws_ok(
  $$ SELECT public.mark_welcome_flow_complete() $$,
  '28000', NULL, 'unauthenticated caller cannot mark completion');

-- ── mark_welcome_flow_complete() — self-scoped happy path ──────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.mark_welcome_flow_complete() $$,
  'authenticated member can mark their own completion');
-- it actually set the column for U1
SELECT isnt(
  (SELECT welcome_flow_completed_at FROM public.profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  NULL, 'welcome_flow_completed_at is now set for the caller');
RESET ROLE;

-- SET-ONCE (discriminating): pin U1 to a KNOWN PAST completion, then replay mark and prove the
-- timestamp is UNCHANGED. A broken writer (plain `= now()` instead of COALESCE) would move it to
-- the transaction time and fail this — within one txn `now()` is constant, so comparing two live
-- calls would NOT catch that; comparing against a fixed past value does.
UPDATE public.profiles SET welcome_flow_completed_at = '2020-01-01T00:00:00Z'
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.mark_welcome_flow_complete() $$, 'replaying the flow succeeds (idempotent)');
RESET ROLE;
SELECT is(
  (SELECT welcome_flow_completed_at FROM public.profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'set-once: mark did NOT overwrite an existing completion timestamp (COALESCE)');

-- U2 completes (a second real completer).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.mark_welcome_flow_complete() $$, 'second real member completes');
RESET ROLE;

-- U3 (a TEST account) completes — must NOT be counted.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.mark_welcome_flow_complete() $$, 'test account completes (will be excluded)');
RESET ROLE;

-- ── get_welcome_flow_completion_count() — live-derived, excludes test + incomplete ─
-- U1 + U2 completed and are real ⇒ 2. U3 completed but is a test account; U4 never completed.
SELECT is(
  (SELECT public.get_welcome_flow_completion_count()),
  2, 'live count == distinct real completers, excluding test accounts and incomplete users');

-- ── set_my_marketing_subscription — accepts the new 'welcome_flow' source ───────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.set_my_marketing_subscription(true, 'welcome_flow') $$,
  'marketing subscription accepts p_source = welcome_flow');
RESET ROLE;

-- it recorded the desired intent for the caller's email (fail-open queue row).
SELECT is(
  (SELECT desired_status FROM public.email_octopus_contact_sync WHERE email = 'u1@example.com'),
  'subscribed', 'welcome_flow opt-in enqueued a subscribed intent for the member email');

SELECT * FROM finish();
ROLLBACK;
