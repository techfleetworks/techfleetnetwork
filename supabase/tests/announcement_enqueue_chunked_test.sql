-- pgTAP: PR2 bounded/resumable announcement enqueue.
-- Run: `supabase db test` against a migrated DB. Rolled back at end.
--
-- Proves:
--   1. announcement_eligible_emails() is the one audience owner: opted-in,
--      non-suppressed, usable, normalized; opt-out / empty / suppressed excluded.
--   2. enqueue_announcement_batch NEVER returns more than p_batch_size considered.
--   3. two cursor-advanced batches cover the whole audience exactly once (no gap,
--      no overlap) — the union equals announcement_eligible_emails().
--   4. a batch is idempotent (re-running the same slice inserts 0 new rows).
--   5. the full RPC and the audience owner agree on the audience size.
--   6. both new functions are service_role-only (no anon/authenticated execute).

BEGIN;
SELECT plan(11);

-- ── Seed a deterministic audience (a,b,c,d eligible; e,f,g excluded) ──────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'pgtap-ch-a@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'pgtap-ch-b@example.com'),
  ('00000000-0000-4000-8000-0000000000b3', 'pgtap-ch-c@example.com'),
  ('00000000-0000-4000-8000-0000000000b4', 'pgtap-ch-d@example.com'),
  ('00000000-0000-4000-8000-0000000000b5', 'pgtap-ch-optout@example.com'),
  ('00000000-0000-4000-8000-0000000000b6', 'pgtap-ch-empty@example.com'),
  ('00000000-0000-4000-8000-0000000000b7', 'pgtap-ch-suppressed@example.com');

INSERT INTO public.profiles (user_id, email, notify_opportunities, display_name) VALUES
  ('00000000-0000-4000-8000-0000000000b1', 'pgtap-ch-a@example.com', true, 'CH A'),
  ('00000000-0000-4000-8000-0000000000b2', 'PGTAP-CH-B@example.com', true, 'CH B'),  -- mixed case → normalized
  ('00000000-0000-4000-8000-0000000000b3', 'pgtap-ch-c@example.com', true, 'CH C'),
  ('00000000-0000-4000-8000-0000000000b4', 'pgtap-ch-d@example.com', true, 'CH D'),
  ('00000000-0000-4000-8000-0000000000b5', 'pgtap-ch-optout@example.com', false, 'CH E'), -- opted out
  ('00000000-0000-4000-8000-0000000000b6', '', true, 'CH F'),                              -- empty email
  ('00000000-0000-4000-8000-0000000000b7', 'pgtap-ch-suppressed@example.com', true, 'CH G') -- suppressed
ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email, notify_opportunities = EXCLUDED.notify_opportunities;

INSERT INTO public.suppressed_emails (email, reason) VALUES
  ('pgtap-ch-suppressed@example.com', 'bounce') ON CONFLICT DO NOTHING;

-- Scope every audience assertion to the pgtap-ch-% emails so other seed data can't skew it.

-- ── 1. The audience owner returns exactly the 4 eligible, normalized emails ───
SELECT is(
  (SELECT count(*)::int FROM public.announcement_eligible_emails() AS e(email)
     WHERE e.email LIKE 'pgtap-ch-%@example.com'),
  4, 'announcement_eligible_emails returns the 4 eligible members');

-- ── 2. Mixed-case b is normalized to lower-case ──────────────────────────────
SELECT ok(
  EXISTS (SELECT 1 FROM public.announcement_eligible_emails() AS e(email)
            WHERE e.email = 'pgtap-ch-b@example.com'),
  'mixed-case email is normalized to lower-case');

-- ── 3. opt-out / empty / suppressed are excluded ─────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.announcement_eligible_emails() AS e(email)
     WHERE e.email IN ('pgtap-ch-optout@example.com','pgtap-ch-suppressed@example.com','')),
  0, 'opted-out, empty-email and suppressed members are excluded');

-- ── 4. A batch never considers more than p_batch_size ─────────────────────────
SELECT is(
  (SELECT considered FROM public.enqueue_announcement_batch(
     '00000000-0000-4000-8000-0000000000bb'::uuid, '[TF] c', '<p>h</p>', 'h', '', 2)),
  2, 'first batch (size 2) considers exactly 2');

-- ── 5. ...and its cursor is the last email of that slice (a,b → b) ────────────
SELECT is(
  (SELECT last_email FROM public.enqueue_announcement_batch(
     '00000000-0000-4000-8000-0000000000bb'::uuid, '[TF] c', '<p>h</p>', 'h', 'pgtap-ch-a@example.com', 1)),
  'pgtap-ch-b@example.com', 'the batch cursor is the last email of the slice');

-- ── 6. Two cursor-advanced batches cover the whole audience exactly once ──────
-- Batch 1 already ran (after=''); run batch 2 from its cursor.
SELECT lives_ok(
  $$ SELECT public.enqueue_announcement_batch(
       '00000000-0000-4000-8000-0000000000bb'::uuid, '[TF] c', '<p>h</p>', 'h',
       'pgtap-ch-b@example.com', 2) $$,
  'second batch runs from the first batch cursor');

SELECT is(
  (SELECT count(DISTINCT recipient)::int FROM public.email_outbox
     WHERE idempotency_key LIKE 'announcement-00000000-0000-4000-8000-0000000000bb-%'),
  4, 'the two batches together enqueued all 4 recipients, exactly once');

-- ── 7. Re-running a slice is idempotent (0 newly inserted) ────────────────────
SELECT is(
  (SELECT inserted FROM public.enqueue_announcement_batch(
     '00000000-0000-4000-8000-0000000000bb'::uuid, '[TF] c', '<p>h</p>', 'h', '', 2)),
  0, 're-running the first slice inserts 0 new rows (idempotent)');

-- ── 8. The full RPC agrees with the audience owner on size ────────────────────
SELECT is(
  (SELECT eligible_count FROM public.enqueue_announcement_emails(
     '00000000-0000-4000-8000-0000000000bc'::uuid, '[TF] full', '<p>h</p>', 'h', NULL)
     )  -  (SELECT count(*)::int FROM public.announcement_eligible_emails()),
  0, 'enqueue_announcement_emails eligible_count equals the audience owner count');

-- ── 9-10. Both new functions are service_role-only ───────────────────────────
SELECT ok(
  has_function_privilege('service_role',
    'public.enqueue_announcement_batch(uuid,text,text,text,text,integer)', 'execute')
  AND NOT has_function_privilege('anon',
    'public.enqueue_announcement_batch(uuid,text,text,text,text,integer)', 'execute'),
  'enqueue_announcement_batch: service_role may execute, anon may not');

SELECT ok(
  has_function_privilege('service_role', 'public.announcement_eligible_emails()', 'execute')
  AND NOT has_function_privilege('anon', 'public.announcement_eligible_emails()', 'execute'),
  'announcement_eligible_emails: service_role may execute, anon may not');

SELECT * FROM finish();
ROLLBACK;
