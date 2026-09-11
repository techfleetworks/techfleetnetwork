-- pgTAP: enqueue_announcement_emails() enqueues the WHOLE eligible audience in one
-- atomic statement (the fix for the ~198/1579 under-reach: the old per-recipient
-- edge loop timed out at ~200 recipients, so the rest were never enqueued).
-- Run: `supabase db test` (CI-pinned CLI) against a migrated DB. Rolled back at end.
--
-- Proves:
--   1. every opted-in, non-suppressed member with a usable email is enqueued
--   2. opted-out / empty-email / SUPPRESSED members are excluded
--   3. mixed-case email is normalized and the exact deterministic key is pinned
--   4. broadcasts get a long (24h) claim window
--   5. a prior-send 'expired' row is re-driven to 'pending'; a 'sent' row is NOT
--   6. re-running is idempotent (0 newly enqueued, no duplicate rows)
--   7. the p_recipients test path targets ONLY the given addresses

BEGIN;
SELECT plan(11);

-- ── Seed a deterministic audience (unique emails so seed data can't skew it) ──
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000a001', 'pgtap-ann-a@example.com'),
  ('00000000-0000-4000-8000-00000000a002', 'pgtap-ann-b@example.com'),
  ('00000000-0000-4000-8000-00000000a003', 'pgtap-ann-c@example.com'),
  ('00000000-0000-4000-8000-00000000a004', 'pgtap-ann-optout@example.com'),
  ('00000000-0000-4000-8000-00000000a005', 'pgtap-ann-empty@example.com'),
  ('00000000-0000-4000-8000-00000000a006', 'pgtap-ann-suppressed@example.com'),
  ('00000000-0000-4000-8000-00000000a007', 'pgtap-ann-d@example.com');

-- auth.users INSERT already fired on_auth_user_created -> handle_new_user(), which
-- pre-creates a profiles row (user_id is the PK). Upsert onto it (matches the
-- sibling scope_aware_unsubscribe_test.sql pattern) instead of a plain INSERT,
-- which would violate profiles_pkey and abort the whole file.
INSERT INTO public.profiles (user_id, email, notify_opportunities) VALUES
  ('00000000-0000-4000-8000-00000000a001', 'pgtap-ann-a@example.com', true),
  ('00000000-0000-4000-8000-00000000a002', 'PGTAP-ANN-B@example.com',  true),  -- mixed case → normalized
  ('00000000-0000-4000-8000-00000000a003', 'pgtap-ann-c@example.com', true),   -- pre-seeded 'expired' below
  ('00000000-0000-4000-8000-00000000a004', 'pgtap-ann-optout@example.com', false), -- opted out
  ('00000000-0000-4000-8000-00000000a005', '', true),                              -- empty email
  ('00000000-0000-4000-8000-00000000a006', 'pgtap-ann-suppressed@example.com', true), -- opted in BUT suppressed
  ('00000000-0000-4000-8000-00000000a007', 'pgtap-ann-d@example.com', true)        -- pre-seeded 'sent' below
ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email, notify_opportunities = EXCLUDED.notify_opportunities;

INSERT INTO public.suppressed_emails (email, reason) VALUES
  ('pgtap-ann-suppressed@example.com', 'bounce') ON CONFLICT DO NOTHING;

-- A prior send left c@ 'expired' (old 60-min window) and d@ already 'sent'.
INSERT INTO public.email_outbox (lane, template, recipient, idempotency_key, message_id, expires_at, status) VALUES
  ('bulk','announcement','pgtap-ann-c@example.com',
   'announcement-00000000-0000-4000-8000-0000000000aa-pgtap-ann-c@example.com',
   'announcement-00000000-0000-4000-8000-0000000000aa-pgtap-ann-c@example.com',
   now() - interval '1 hour', 'expired'),
  ('bulk','announcement','pgtap-ann-d@example.com',
   'announcement-00000000-0000-4000-8000-0000000000aa-pgtap-ann-d@example.com',
   'announcement-00000000-0000-4000-8000-0000000000aa-pgtap-ann-d@example.com',
   now() + interval '1 hour', 'sent');

-- ── 1. Full send runs atomically ────────────────────────────────────────────
SELECT lives_ok(
  $$ SELECT public.enqueue_announcement_emails(
       '00000000-0000-4000-8000-0000000000aa'::uuid,
       '[Tech Fleet] Test', '<p>hi</p>', 'hi', NULL) $$,
  'enqueue_announcement_emails runs for the full audience');

-- ── 2. All four eligible members (a,b,c,d) have an outbox row ────────────────
SELECT is(
  (SELECT count(DISTINCT recipient)::int FROM public.email_outbox
     WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
       AND recipient LIKE 'pgtap-ann-%@example.com'),
  4,
  'all 4 opted-in members are covered (a,b,c re-driven/new + d already sent)');

-- ── 3-5. Opted-out, empty-email, and SUPPRESSED members are excluded ────────
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.email_outbox
    WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
      AND recipient = 'pgtap-ann-optout@example.com'),
  'opted-out member (notify_opportunities=false) is NOT enqueued');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.email_outbox
    WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
      AND recipient = ''),
  'empty-email member is NOT enqueued');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.email_outbox
    WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
      AND recipient = 'pgtap-ann-suppressed@example.com'),
  'globally-suppressed member (in suppressed_emails) is NOT enqueued');

-- ── 6. Mixed-case email normalized; exact deterministic key pinned ──────────
SELECT ok(
  EXISTS (SELECT 1 FROM public.email_outbox
    WHERE idempotency_key = 'announcement-00000000-0000-4000-8000-0000000000aa-pgtap-ann-b@example.com'),
  'PGTAP-ANN-B is normalized to lowercase and keyed as announcement-<id>-<lower(email)>');

-- ── 7. Broadcast rows get a ~24h claim window ───────────────────────────────
SELECT ok(
  (SELECT expires_at FROM public.email_outbox
     WHERE recipient = 'pgtap-ann-a@example.com'
       AND idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%')
   > now() + interval '23 hours',
  'a newly-enqueued announcement row has a ~24h claim window (tail cannot expire mid-drain)');

-- ── 8-9. Expired row re-driven to pending; sent row untouched (no re-send) ───
SELECT is(
  (SELECT status FROM public.email_outbox
     WHERE recipient = 'pgtap-ann-c@example.com'
       AND idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'),
  'pending',
  'a prior-send EXPIRED row is re-driven back to pending (recovery reaches the tail)');

SELECT is(
  (SELECT count(*)::int FROM public.email_outbox
     WHERE recipient = 'pgtap-ann-d@example.com'
       AND idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000aa-%'
       AND status = 'sent'),
  1,
  'an already-SENT row is left untouched and not duplicated (no re-blast)');

-- ── 10. Idempotent re-run: 0 newly enqueued ─────────────────────────────────
SELECT is(
  (SELECT enqueued_count FROM public.enqueue_announcement_emails(
     '00000000-0000-4000-8000-0000000000aa'::uuid,
     '[Tech Fleet] Test', '<p>hi</p>', 'hi', NULL)),
  0,
  're-running the same send enqueues 0 new rows (deterministic idempotency key)');

-- ── 11. Test-recipient path targets ONLY the given addresses ────────────────
SELECT is(
  (SELECT eligible_count FROM public.enqueue_announcement_emails(
     '00000000-0000-4000-8000-0000000000bb'::uuid,
     '[Tech Fleet] Probe', '<p>probe</p>', 'probe',
     ARRAY['pgtap-ann-qa@example.com'])),
  1,
  'p_recipients delivery probe resolves to exactly the passed address (profiles untouched)');

SELECT * FROM finish();
ROLLBACK;
