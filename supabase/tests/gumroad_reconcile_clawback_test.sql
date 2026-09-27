-- pgTAP: Gumroad reconcile clawback fix (ADR-0063).
-- Proves the structural guarantee that the audit found broken: a refund pulled by
-- the reconcile path for a sale already in the ledger downgrades access, and a
-- refunded sale can never still grant. apply_gumroad_sale_lifecycle is set-once
-- (never clears, never churns) and is service-role only. Rolled back at the end.

BEGIN;
SELECT plan(11);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'clawback@example.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (user_id, display_name, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Clawback', 'clawback@example.com')
ON CONFLICT (user_id) DO NOTHING;

-- A cataloged, non-founding SKU so a refund cleanly drops to starter (no founding latch).
INSERT INTO public.membership_products (product_id, tier, is_founding, billing_period, rank)
VALUES ('community-monthly', 'community', false, 'monthly', 50)
ON CONFLICT (product_id) DO NOTHING;

-- An active sale already in the ledger, granting community.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, resolved_user_id, status)
VALUES ('clawback-sale', 'clawback@example.com', 'community-monthly',
        '33333333-3333-3333-3333-333333333333', 'applied');
SELECT is(
  public.compute_membership('33333333-3333-3333-3333-333333333333'),
  'community'::public.membership_tier,
  'an active cataloged sale grants community');

-- ── The fix: reconcile pulls a refund for a sale ALREADY in the ledger ────────
-- 1. apply reports it matched an existing row.
SELECT is(
  public.apply_gumroad_sale_lifecycle('clawback-sale', true, false, NULL, NULL),
  true, 'apply_gumroad_sale_lifecycle matches and updates the existing sale');

-- 2. refunded_at is now set on the ledger row.
SELECT isnt(
  (SELECT refunded_at FROM public.gumroad_sales WHERE sale_id = 'clawback-sale'),
  NULL, 'refunded_at is set on the existing sale');

-- 3. the AFTER UPDATE projection trigger already downgraded the member to starter,
--    with no explicit reproject. This is the whole chain a missed webhook broke.
SELECT is(
  (SELECT membership_tier FROM public.profiles WHERE user_id = '33333333-3333-3333-3333-333333333333'),
  'starter'::public.membership_tier,
  'applying the pulled refund downgrades access via the projection trigger');

-- 4. THE INVARIANT: a refunded sale can never still grant, even on a fresh reproject.
SELECT is(
  public.compute_membership('33333333-3333-3333-3333-333333333333'),
  'starter'::public.membership_tier,
  'a refunded sale yields no active membership');

-- ── Set-once safety: cannot churn or clear ────────────────────────────────────
-- 5. A second identical apply is a no-op (returns false), so repeated sweeps do not
--    re-fire the trigger or move the timestamp.
SELECT is(
  public.apply_gumroad_sale_lifecycle('clawback-sale', true, false, NULL, NULL),
  false, 'a repeated apply is a no-op (set-once)');

-- 6. apply never CLEARS a clawback: a call with p_refunded=false leaves refunded_at set.
SELECT is(
  public.apply_gumroad_sale_lifecycle('clawback-sale', false, false, NULL, NULL),
  false, 'apply with no lifecycle flags is a no-op');
SELECT isnt(
  (SELECT refunded_at FROM public.gumroad_sales WHERE sale_id = 'clawback-sale'),
  NULL, 'refunded_at is never cleared by a later apply');

-- 7. apply on a sale that is not in the ledger is a safe no-op, not an error.
SELECT is(
  public.apply_gumroad_sale_lifecycle('no-such-sale', true, true, NULL, NULL),
  false, 'apply on a missing sale matches nothing and does not error');

-- ── COALESCE isolation: an already-set timestamp is preserved, not moved ──────
-- When the row IS updated via a NEW flag (dispute), the SET clause runs, so this
-- proves COALESCE keeps the original refunded_at independent of the WHERE guard.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, resolved_user_id, status, refunded_at)
VALUES ('coalesce-sale', 'clawback@example.com', 'community-monthly',
        '33333333-3333-3333-3333-333333333333', 'applied', '2020-01-01T00:00:00Z');
SELECT is(
  public.apply_gumroad_sale_lifecycle('coalesce-sale', true, true, NULL, NULL),
  true, 'apply matches via a new dispute flag on an already-refunded sale');
SELECT is(
  (SELECT refunded_at FROM public.gumroad_sales WHERE sale_id = 'coalesce-sale'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'COALESCE preserves the original refunded_at even when the row is updated');

-- ── Least privilege: members can never call it ────────────────────────────────
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.apply_gumroad_sale_lifecycle('clawback-sale', true, false, NULL, NULL) $$,
  '42501', NULL, 'an authenticated member cannot call apply_gumroad_sale_lifecycle');
RESET role;

SELECT * FROM finish();
ROLLBACK;
