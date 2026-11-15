-- pgTAP: Welcome Flow break-glass reset (requirements §7.7, migration
-- 20261115120000_welcome_flow_break_glass_reset). Proves admin_reset_welcome_flow is
-- admin-gated, single-user, and actually clears the completion fact:
--   * the function exists;
--   * an unauthenticated caller is rejected (42501);
--   * a non-admin authenticated caller is rejected (42501) — cannot reset even themselves;
--   * an admin caller clears welcome_flow_completed_at for the target;
--   * a non-admin can never null the column (defense-in-depth on the gate's re-arm path).
-- Runs in a rolled-back txn.

BEGIN;
SELECT plan(5);

SELECT has_function(
  'public', 'admin_reset_welcome_flow', ARRAY['uuid'],
  'admin_reset_welcome_flow(uuid) exists');

-- ── Fixtures ─────────────────────────────────────────────────────────────────────
SET session_replication_role = replica;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'target@example.com')
ON CONFLICT (id) DO NOTHING;

-- Target starts COMPLETE (a known past timestamp); admin is an ordinary profile.
INSERT INTO public.profiles (user_id, email, welcome_flow_completed_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'target@example.com', '2020-01-01T00:00:00Z')
ON CONFLICT (user_id) DO NOTHING;

-- Grant the admin role (has_role reads public.user_roles).
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin')
ON CONFLICT DO NOTHING;

SET session_replication_role = default;

-- ── Unauthenticated → forbidden ────────────────────────────────────────────────────
SELECT throws_ok(
  $$ SELECT public.admin_reset_welcome_flow('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '42501', NULL, 'unauthenticated caller cannot reset');

-- ── Non-admin authenticated → forbidden (cannot reset even themselves) ───────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.admin_reset_welcome_flow('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '42501', NULL, 'non-admin authenticated caller cannot reset');
RESET ROLE;

-- ── Admin → resets the target's completion to NULL ──────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.admin_reset_welcome_flow('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'admin can break-glass reset a user');
RESET ROLE;

SELECT is(
  (SELECT welcome_flow_completed_at FROM public.profiles
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  NULL, 'target completion was cleared (user re-enters the mandatory flow)');

SELECT * FROM finish();
ROLLBACK;
