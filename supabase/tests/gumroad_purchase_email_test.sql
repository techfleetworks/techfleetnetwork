-- pgTAP: Gumroad purchase email (UC2, ADR-0041).
-- Run: `supabase db test`. Proves the gumroad_sales purchase-email trigger enqueues a
-- Tier-0 founding-purchase email exactly once for a resolved MEMBERSHIP sale, and nothing
-- for non-membership or not-yet-linked (pending_user) sales. Rolled back at the end.

BEGIN;
SELECT plan(6);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'buyer@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Buyer', 'buyer@example.com')
ON CONFLICT (user_id) DO NOTHING;
-- Founding SKU 'ftpql' is seeded by the ledger-projection migration.

-- 1. A resolved MEMBERSHIP sale enqueues exactly one founding-purchase email.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status)
VALUES ('sale-m', 'buyer@example.com', 'ftpql', 'founding-membership',
        '11111111-1111-1111-1111-111111111111', 'applied');
SELECT is(
  (SELECT count(*) FROM public.email_outbox WHERE idempotency_key = 'founding-purchase:sale-m'),
  1::bigint,
  'a resolved membership sale enqueues one founding-purchase email');

-- 2. …with the founding-purchase template, to the buyer.
SELECT is(
  (SELECT template FROM public.email_outbox WHERE idempotency_key = 'founding-purchase:sale-m'),
  'founding-purchase',
  'enqueued under the founding-purchase template');

-- 3. Re-firing (link cleared then re-set) does NOT enqueue a duplicate (idempotency_key).
UPDATE public.gumroad_sales SET resolved_user_id = NULL
  WHERE sale_id = 'sale-m';                                   -- fires, but unresolved → no enqueue
UPDATE public.gumroad_sales SET resolved_user_id = '11111111-1111-1111-1111-111111111111'
  WHERE sale_id = 'sale-m';                                   -- re-fires with the same key
SELECT is(
  (SELECT count(*) FROM public.email_outbox WHERE idempotency_key = 'founding-purchase:sale-m'),
  1::bigint,
  're-firing the trigger never enqueues a second email (exactly-once)');

-- 4. A non-membership (uncataloged) product enqueues nothing.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, resolved_user_id, status)
VALUES ('sale-x', 'buyer@example.com', 'some-masterclass-product',
        '11111111-1111-1111-1111-111111111111', 'applied');
SELECT is(
  (SELECT count(*) FROM public.email_outbox WHERE idempotency_key = 'founding-purchase:sale-x'),
  0::bigint,
  'a non-membership sale enqueues no purchase email (membership-scoped)');

-- 5. A pending_user membership sale (no linked user yet) enqueues nothing.
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status)
VALUES ('sale-p', 'nobody@example.com', 'ftpql', 'founding-membership', NULL, 'pending_user');
SELECT is(
  (SELECT count(*) FROM public.email_outbox WHERE idempotency_key = 'founding-purchase:sale-p'),
  0::bigint,
  'a pending_user membership sale enqueues no purchase email (no user yet)');

-- 6. A refunded membership sale (even when linked) enqueues nothing (active-only).
INSERT INTO public.gumroad_sales (sale_id, email, product_id, product_permalink, resolved_user_id, status, refunded_at)
VALUES ('sale-r', 'buyer@example.com', 'ftpql', 'founding-membership',
        '11111111-1111-1111-1111-111111111111', 'applied', now());
SELECT is(
  (SELECT count(*) FROM public.email_outbox WHERE idempotency_key = 'founding-purchase:sale-r'),
  0::bigint,
  'a refunded membership sale enqueues no purchase email (active-only)');

SELECT * FROM finish();
ROLLBACK;
