-- pgTAP: Founding Members Discord role — invariant target set + dry-run report (ADR-0049, PR-A).
-- Run: `supabase db test`. Proves (1) the config seed, (2) the target set = founding AND
-- Discord-connected ONLY, (3) the dry-run report counts correctly, (4) DARK: the report
-- enqueues nothing. Rolled back at the end.

BEGIN;
SELECT plan(7);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- U1 founding + discord (target); U2 founding + no discord (gap); U3 discord + not founding.
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'u1@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'u2@example.com'),
  ('a0000000-0000-0000-0000-000000000003', 'u3@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'U1', 'u1@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'U2', 'u2@example.com'),
  ('a0000000-0000-0000-0000-000000000003', 'U3', 'u3@example.com')
ON CONFLICT (user_id) DO NOTHING;

-- Flip founding TRUE for U1 and U2 via the ledger — is_founding_member is column-guarded, so
-- only compute_membership may set it; a founding gumroad_sale fires the projection trigger.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status) VALUES
  ('f-u1', 'u1@example.com', 'ftpql', 'founding-membership', 'a0000000-0000-0000-0000-000000000001', 'applied'),
  ('f-u2', 'u2@example.com', 'ftpql', 'founding-membership', 'a0000000-0000-0000-0000-000000000002', 'applied');

-- Connect Discord (the OAuth-verified fields) for U1 (target) and U3 (not founding); NOT U2.
UPDATE public.profiles SET discord_user_id = '111111111111111111', discord_username = 'u1disc', has_discord_account = true
  WHERE user_id = 'a0000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET discord_user_id = '333333333333333333', discord_username = 'u3disc', has_discord_account = true
  WHERE user_id = 'a0000000-0000-0000-0000-000000000003';

-- 0. Fixture sanity: the ledger really flipped founding for U1 and U2.
SELECT is(
  (SELECT count(*)::int FROM public.profiles
    WHERE is_founding_member = true
      AND user_id IN ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002')),
  2, 'fixture: U1 and U2 are founding members via the ledger');

-- 1. Config seed persisted (AC3).
SELECT is(
  (SELECT role_id FROM public.discord_roles WHERE key = 'founding_members'),
  '1533887923597087041', 'discord_roles seeds the Founding Members role id (AC3)');

-- 2. Target set includes U1 (founding AND Discord-connected).
SELECT ok(
  EXISTS (SELECT 1 FROM public.list_founding_discord_role_targets()
           WHERE user_id = 'a0000000-0000-0000-0000-000000000001'),
  'target set includes the founding, Discord-connected member');

-- 3. Target set EXCLUDES U2 (founding but not connected).
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.list_founding_discord_role_targets()
              WHERE user_id = 'a0000000-0000-0000-0000-000000000002'),
  'target set excludes a founding member who has not connected Discord');

-- 4. Target set EXCLUDES U3 (connected but not founding).
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.list_founding_discord_role_targets()
              WHERE user_id = 'a0000000-0000-0000-0000-000000000003'),
  'target set excludes a connected member who is not founding');

-- 5. Dry-run report: exactly one connected target (U1).
SELECT is(
  (SELECT connected_targets FROM public.report_founding_discord_role_gap()),
  1, 'dry-run report counts exactly one connected target (U1)');

-- 6. DARK guarantee: the dry-run report enqueues NOTHING into the shared grant queue.
SELECT is(
  (SELECT count(*)::int FROM public.discord_role_grant_queue
    WHERE role_id = '1533887923597087041'),
  0, 'dry-run report performs no enqueue (PR-A does no Discord writes)');

SELECT * FROM finish();
ROLLBACK;
