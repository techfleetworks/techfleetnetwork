-- pgTAP — proves ADR-0052 (retire stats-snapshot subsystem) did NOT regress badge emission or the
-- course_completions ledger, and that the vestigial objects are gone. Runs in a rolled-back txn.
-- Run: `supabase db test` (or pg_prove) against a DB with the migrations applied.
--
-- The landmine ADR-0052 had to avoid: discord_linked badges were emitted ONLY by the (now dropped)
-- recompute_all_stats backfill, with no live trigger. Test (b) proves the new live trigger replaces
-- that. Tests (a)/(c) prove course-completion badges still fire and the retired objects are gone.

BEGIN;
SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- U1 completes a real core course (badge path); U2 links Discord (discord_linked path). Both are
-- real (non-test) members. handle_new_user auto-creates a profile on the auth.users insert, so we
-- UPSERT to force is_test_account=false and start with no Discord link.
INSERT INTO auth.users (id, email) VALUES
  ('b0000000-0000-0000-0000-000000000001','u1@retire.test'),
  ('b0000000-0000-0000-0000-000000000002','u2@retire.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, email, is_test_account) VALUES
  ('b0000000-0000-0000-0000-000000000001','U1','u1@retire.test',false),
  ('b0000000-0000-0000-0000-000000000002','U2','u2@retire.test',false)
ON CONFLICT (user_id) DO UPDATE SET is_test_account = EXCLUDED.is_test_account;

-- ── (a) Completing a course still inserts the course_completed badge ───────────────────────────
-- U1 completes every required lesson of the seeded core course 'agile-mindset'. The live
-- journey_progress completion trigger must insert the course_completed:agile-mindset badge (this is
-- the fn_emit_badge call ADR-0052 explicitly KEEPS while dropping the stored-counter writes).
INSERT INTO public.journey_progress (user_id, phase, task_id, completed, completed_at)
SELECT 'b0000000-0000-0000-0000-000000000001', lc.phase, lc.lesson_id, true, now()
FROM public.lesson_catalog lc
WHERE lc.course_key = 'agile-mindset' AND lc.active AND lc.required;

SELECT is(
  (SELECT count(*) FROM public.badges_awarded
     WHERE user_id = 'b0000000-0000-0000-0000-000000000001'
       AND badge_code = 'course_completed:agile-mindset'),
  1::bigint,
  '(a) finishing a course still emits the course_completed badge (ledger + badge path intact)');

-- ── (b) Setting profiles.discord_user_id emits a discord_linked badge LIVE ──────────────────────
-- No badge before linking.
SELECT is(
  (SELECT count(*) FROM public.badges_awarded
     WHERE user_id = 'b0000000-0000-0000-0000-000000000002' AND badge_code = 'discord_linked'),
  0::bigint,
  '(b0) no discord_linked badge before the account links Discord');

UPDATE public.profiles
   SET discord_user_id = '900000000000000001'
 WHERE user_id = 'b0000000-0000-0000-0000-000000000002';

-- The new AFTER trigger (fn_emit_discord_linked_badge) fires immediately — no recompute, no cron.
SELECT is(
  (SELECT count(*) FROM public.badges_awarded
     WHERE user_id = 'b0000000-0000-0000-0000-000000000002' AND badge_code = 'discord_linked'),
  1::bigint,
  '(b) setting discord_user_id emits a discord_linked badge live (replaces recompute backfill)');

-- ── (c) The retired objects no longer exist ────────────────────────────────────────────────────
SELECT hasnt_table('public', 'course_completion_stats',
  '(c) course_completion_stats table is dropped');
SELECT hasnt_table('public', 'network_stats_snapshots',
  '(c) network_stats_snapshots table is dropped');
SELECT hasnt_function('public', 'recompute_all_stats',
  '(c) recompute_all_stats() is dropped');
SELECT hasnt_function('public', 'admin_recompute_stats',
  '(c) admin_recompute_stats() is dropped');
SELECT hasnt_function('public', 'admin_reconcile_parity',
  '(c) admin_reconcile_parity() is dropped');

SELECT * FROM finish();
ROLLBACK;
