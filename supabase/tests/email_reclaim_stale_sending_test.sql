-- pgTAP: reclaim_stale_sending_v2() returns ORPHANED 'sending' rows to 'pending'
-- without touching legitimately in-flight rows or already-expired rows.
-- Run: `supabase db test`. Rolled back at end.
--
-- Proves:
--   1. a row 'sending' past the lease but not expired is reclaimed (→ pending, lease cleared)
--   2. a freshly-claimed 'sending' row (within the lease) is NOT reclaimed
--   3. an already-expired 'sending' row is left for the expiry job, NOT reclaimed
--   4. a 'pending' row is untouched
--   5. the function is service_role-only
--   6. the reclaim cron job is scheduled

BEGIN;
SELECT plan(10);

-- ── Seed outbox rows in distinct states (lease is 10 min) ────────────────────
INSERT INTO public.email_outbox (lane, template, recipient, idempotency_key, message_id, status, claimed_at, expires_at) VALUES
  -- (a) ORPHAN: bulk, sending, claimed 15 min ago (> 10-min lease), not expired → reclaim
  ('bulk','announcement','reclaim-orphan@example.com',
   'reclaim-test-orphan','reclaim-test-orphan', 'sending', now() - interval '15 minutes', now() + interval '30 minutes'),
  -- (b) FRESH: bulk, sending, claimed 1 min ago (< lease) → leave in flight
  ('bulk','announcement','reclaim-fresh@example.com',
   'reclaim-test-fresh','reclaim-test-fresh', 'sending', now() - interval '1 minute', now() + interval '30 minutes'),
  -- (c) EXPIRED: bulk, sending, claimed 15 min ago BUT already past expires_at → expiry job's business, not ours
  ('bulk','announcement','reclaim-expired@example.com',
   'reclaim-test-expired','reclaim-test-expired', 'sending', now() - interval '15 minutes', now() - interval '1 minute'),
  -- (d) PENDING: bulk, untouched
  ('bulk','announcement','reclaim-pending@example.com',
   'reclaim-test-pending','reclaim-test-pending', 'pending', NULL, now() + interval '30 minutes'),
  -- (e) AUTH ORPHAN: same orphan shape but lane='auth' → must NOT be reclaimed (bulk-only scope)
  ('auth','recovery','reclaim-authorphan@example.com',
   'reclaim-test-authorphan','reclaim-test-authorphan', 'sending', now() - interval '15 minutes', now() + interval '30 minutes');

-- ── 1. Exactly one row (the orphan) is reclaimed ─────────────────────────────
SELECT is(
  (SELECT public.reclaim_stale_sending_v2()),
  1, 'reclaim_stale_sending_v2 reclaims exactly the one orphan');

-- ── 2-3. The orphan is now pending with its lease cleared ────────────────────
SELECT is(
  (SELECT status FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-orphan'),
  'pending', 'the orphan is returned to pending');
SELECT ok(
  (SELECT claimed_at IS NULL FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-orphan'),
  'the orphan lease (claimed_at) is cleared');

-- ── 3b. ...and is immediately eligible for the next claim ────────────────────
SELECT ok(
  (SELECT next_attempt_at <= now() FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-orphan'),
  'the reclaimed orphan is immediately claimable (next_attempt_at <= now)');

-- ── 4. The freshly-claimed row is still in flight ────────────────────────────
SELECT is(
  (SELECT status FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-fresh'),
  'sending', 'a row within the lease is NOT reclaimed');

-- ── 5. The already-expired row is left alone (expiry job owns it) ─────────────
SELECT is(
  (SELECT status FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-expired'),
  'sending', 'an already-expired sending row is NOT reclaimed');

-- ── 6. The pending row is untouched ──────────────────────────────────────────
SELECT is(
  (SELECT status FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-pending'),
  'pending', 'a pending row is untouched');

-- ── 7. The AUTH-lane orphan is NOT reclaimed (bulk-only scope) ────────────────
SELECT is(
  (SELECT status FROM public.email_outbox WHERE idempotency_key = 'reclaim-test-authorphan'),
  'sending', 'an auth-lane orphan is NOT reclaimed — reclaim is bulk-only in PR3');

-- ── 8. service_role-only (anon AND authenticated denied) ──────────────────────
SELECT ok(
  has_function_privilege('service_role', 'public.reclaim_stale_sending_v2()', 'execute')
  AND NOT has_function_privilege('anon', 'public.reclaim_stale_sending_v2()', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.reclaim_stale_sending_v2()', 'execute'),
  'reclaim_stale_sending_v2: only service_role may execute');

-- ── 8. The reclaim cron is scheduled ─────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM cron.job WHERE jobname = 'email-v2-reclaim-sending'),
  1, 'the email-v2-reclaim-sending cron job is scheduled');

SELECT * FROM finish();
ROLLBACK;
