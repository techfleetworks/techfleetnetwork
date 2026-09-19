-- pgTAP — proves the displayed-stats RPCs are LIVE reads of the source of truth (ADR-0050),
-- not stored counters. A stored/denormalized counter cannot pass these: the count must move
-- the instant a row changes, within this same rolled-back transaction (no recompute, no cron).
-- Run: `supabase db test` (or pg_prove) against a DB with the migrations applied.

BEGIN;
SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- A, B, D are real members; C is a test account and must be excluded everywhere.
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001','a@live.test'),
  ('a0000000-0000-0000-0000-000000000002','b@live.test'),
  ('a0000000-0000-0000-0000-000000000003','c@live.test'),
  ('a0000000-0000-0000-0000-000000000004','d@live.test')
ON CONFLICT (id) DO NOTHING;

-- handle_new_user auto-creates a profile (is_test_account=false) when the auth.users row is
-- inserted above, so DO NOTHING would never apply is_test_account=true to C. Force it.
INSERT INTO public.profiles (user_id, display_name, email, is_test_account) VALUES
  ('a0000000-0000-0000-0000-000000000001','A','a@live.test',false),
  ('a0000000-0000-0000-0000-000000000002','B','b@live.test',false),
  ('a0000000-0000-0000-0000-000000000003','C','c@live.test',true),
  ('a0000000-0000-0000-0000-000000000004','D','d@live.test',false)
ON CONFLICT (user_id) DO UPDATE SET is_test_account = EXCLUDED.is_test_account;

-- ── Course cards: get_course_completion_counts ─────────────────────────────────
-- A synthetic two-task course. Its task_ids are absent from real data and from
-- lesson_catalog, so the completion trigger is a no-op and the live count starts at 0.

-- 1) No completers before anyone completes anything.
SELECT is(
  (SELECT completers FROM public.get_course_completion_counts(
     '[{"key":"zz-live","phase":"first_steps","task_ids":["zz-live-1","zz-live-2"]}]'::jsonb)
   WHERE course_key = 'zz-live'),
  0::bigint,
  'completer count starts at 0 (live read of empty rows)');

-- A completes BOTH required tasks.
INSERT INTO public.journey_progress (user_id, phase, task_id, completed, completed_at) VALUES
  ('a0000000-0000-0000-0000-000000000001','first_steps','zz-live-1',true, now()),
  ('a0000000-0000-0000-0000-000000000001','first_steps','zz-live-2',true, now());

-- 2) Exactly 1 completer immediately — no recompute, no cron.
SELECT is(
  (SELECT completers FROM public.get_course_completion_counts(
     '[{"key":"zz-live","phase":"first_steps","task_ids":["zz-live-1","zz-live-2"]}]'::jsonb)
   WHERE course_key = 'zz-live'),
  1::bigint,
  'completing all required tasks is counted immediately (live)');

-- B completes only ONE of the two required tasks.
INSERT INTO public.journey_progress (user_id, phase, task_id, completed, completed_at) VALUES
  ('a0000000-0000-0000-0000-000000000002','first_steps','zz-live-1',true, now());

-- 3) Partial completion does not count.
SELECT is(
  (SELECT completers FROM public.get_course_completion_counts(
     '[{"key":"zz-live","phase":"first_steps","task_ids":["zz-live-1","zz-live-2"]}]'::jsonb)
   WHERE course_key = 'zz-live'),
  1::bigint,
  'a member who finished only some required tasks is not a completer');

-- Test account C completes BOTH tasks.
INSERT INTO public.journey_progress (user_id, phase, task_id, completed, completed_at) VALUES
  ('a0000000-0000-0000-0000-000000000003','first_steps','zz-live-1',true, now()),
  ('a0000000-0000-0000-0000-000000000003','first_steps','zz-live-2',true, now());

-- 4) Test accounts are excluded (still 1).
SELECT is(
  (SELECT completers FROM public.get_course_completion_counts(
     '[{"key":"zz-live","phase":"first_steps","task_ids":["zz-live-1","zz-live-2"]}]'::jsonb)
   WHERE course_key = 'zz-live'),
  1::bigint,
  'test accounts are excluded from completer counts');

-- A un-completes one task — the case a stored +1 counter can never reflect.
-- Un-completing is guarded (trg_journey_progress_block_silent_uncomplete); the
-- confirm-dialog path sets app.allow_uncomplete='true' in-txn, so do the same here.
SELECT set_config('app.allow_uncomplete', 'true', true);
UPDATE public.journey_progress
   SET completed = false, completed_at = NULL
 WHERE user_id = 'a0000000-0000-0000-0000-000000000001' AND task_id = 'zz-live-2';

-- 5) The count drops back to 0 — live read, not an only-grows counter.
SELECT is(
  (SELECT completers FROM public.get_course_completion_counts(
     '[{"key":"zz-live","phase":"first_steps","task_ids":["zz-live-1","zz-live-2"]}]'::jsonb)
   WHERE course_key = 'zz-live'),
  0::bigint,
  'un-completing a required task immediately decrements the count (live, not stored)');

-- ── Dashboard: get_network_stats ───────────────────────────────────────────────
-- 6) total_signups equals the live non-test profile count (not a frozen snapshot).
SELECT is(
  (public.get_network_stats()->>'total_signups')::bigint,
  (SELECT count(*) FROM public.profiles WHERE NOT COALESCE(is_test_account,false))::bigint,
  'total_signups equals the live non-test profile count (no frozen snapshot)');

-- 7-8) "Core Course Completions" is derived LIVE from journey_progress too — not the
-- append-only course_completions ledger — so it must rise when a member finishes a core
-- course and fall when they un-finish it. Uses the seeded core course 'agile-mindset' + D.
CREATE TEMP TABLE _base AS
  SELECT (public.get_network_stats()->>'core_courses_active')::bigint AS core;

INSERT INTO public.journey_progress (user_id, phase, task_id, completed, completed_at)
SELECT 'a0000000-0000-0000-0000-000000000004', lc.phase, lc.lesson_id, true, now()
FROM public.lesson_catalog lc
WHERE lc.course_key = 'agile-mindset' AND lc.active AND lc.required;

-- 7) Finishing every required lesson of a core course increments the tile, live.
SELECT is(
  (public.get_network_stats()->>'core_courses_active')::bigint,
  (SELECT core FROM _base) + 1,
  'finishing a core course increments core_courses_active live (dashboard, not a ledger)');

SELECT set_config('app.allow_uncomplete', 'true', true);
UPDATE public.journey_progress SET completed = false, completed_at = NULL
 WHERE user_id = 'a0000000-0000-0000-0000-000000000004'
   AND task_id = (SELECT lesson_id FROM public.lesson_catalog
                   WHERE course_key = 'agile-mindset' AND active AND required
                   ORDER BY display_order LIMIT 1);

-- 8) Un-finishing one required lesson drops it back — proves the dashboard is live too.
SELECT is(
  (public.get_network_stats()->>'core_courses_active')::bigint,
  (SELECT core FROM _base),
  'un-finishing one required lesson drops core_courses_active back (live, not only-grows)');

SELECT * FROM finish();
ROLLBACK;
