-- pgTAP: enqueue_announcement_emails() enqueues the WHOLE eligible audience in one
-- atomic statement (the fix for the ~198/1579 under-reach: the old per-recipient
-- edge loop timed out at ~200 recipients, so the rest were never enqueued).
-- Run: `supabase db test` (CI-pinned CLI) against a migrated DB. Rolled back at end.
--
-- Proves:
--   1. every opted-in member with a usable email is enqueued exactly once
--   2. opted-out / empty-email members are excluded
--   3. re-running is idempotent — no duplicate outbox rows (deterministic key)
--   4. broadcasts get a long (24h) claim window so the tail can't expire mid-drain
--   5. the p_recipients test path enqueues ONLY those addresses (delivery probe)

BEGIN;
SELECT plan(7);

-- ── Seed a deterministic audience (unique emails so seed data can't skew it) ──
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000a001', 'pgtap-ann-a@example.com'),
  ('00000000-0000-4000-8000-00000000a002', 'pgtap-ann-b@example.com'),
  ('00000000-0000-4000-8000-00000000a003', 'pgtap-ann-c@example.com'),
  ('00000000-0000-4000-8000-00000000a004', 'pgtap-ann-optout@example.com'),
  ('00000000-0000-4000-8000-00000000a005', 'pgtap-ann-empty@example.com');

INSERT INTO public.profiles (user_id, email, notify_opportunities) VALUES
  ('00000000-0000-4000-8000-00000000a001', 'pgtap-ann-a@example.com', true),
  ('00000000-0000-4000-8000-00000000a002', 'PGTAP-ANN-B@example.com',  true),   -- mixed case → normalized
  ('00000000-0000-4000-8000-00000000a003', 'pgtap-ann-c@example.com', true),
  ('00000000-0000-4000-8000-00000000a004', 'pgtap-ann-optout@example.com', false), -- opted out
  ('00000000-0000-4000-8000-00000000a005', '', true);                              -- empty email

-- ── 1. Full send enqueues every eligible member exactly once ─────────────────
SELECT lives_ok(
  $$ SELECT public.enqueue_announcement_emails(
       '00000000-0000-4000-8000-0000000000aa'::uuid,
       '[Tech Fleet] Test', '<p>hi</p>', 'hi', NULL) $$,
  'enqueue_announcement_emails runs for the full audience');

SELECT is(
  (SELECT count(*)::int FROM public.email_outbox
     WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
       AND recipient LIKE 'pgtap-ann-%@example.com'),
  3,
  'all 3 opted-in members are enqueued (mixed-case email normalized)');

-- ── 2. Opted-out and empty-email members are excluded ────────────────────────
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.email_outbox
    WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
      AND recipient = 'pgtap-ann-optout@example.com'),
  'opted-out member (notify_opportunities=false) is NOT enqueued');

-- ── 4. Broadcast claim window is long enough to drain a large burst ──────────
SELECT ok(
  (SELECT min(expires_at) FROM public.email_outbox
     WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%')
   > now() + interval '23 hours',
  'announcement rows get a ~24h claim window (tail cannot expire mid-drain)');

-- ── 3. Idempotent re-run: no duplicates, 0 newly enqueued ────────────────────
SELECT is(
  (SELECT enqueued_count FROM public.enqueue_announcement_emails(
     '00000000-0000-4000-8000-0000000000aa'::uuid,
     '[Tech Fleet] Test', '<p>hi</p>', 'hi', NULL)),
  0,
  're-running the same send enqueues 0 new rows (deterministic idempotency key)');

SELECT is(
  (SELECT count(*)::int FROM public.email_outbox
     WHERE recipient = 'pgtap-ann-a@example.com'
       AND idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'),
  1,
  'a recipient still has exactly one outbox row after a re-run (no re-blast)');

-- ── 5. Test-recipient path targets ONLY the given addresses ──────────────────
SELECT is(
  (SELECT eligible_count FROM public.enqueue_announcement_emails(
     '00000000-0000-4000-8000-0000000000bb'::uuid,
     '[Tech Fleet] Probe', '<p>probe</p>', 'probe',
     ARRAY['pgtap-ann-qa@example.com'])),
  1,
  'p_recipients delivery probe resolves to exactly the passed address (profiles untouched)');

SELECT * FROM finish();
ROLLBACK;
