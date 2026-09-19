-- pgTAP — proves the DB's definition of "which lessons make up each course"
-- (public.lesson_catalog active+required rows, seeded in migration
-- 20260520035523_*.sql) EXACTLY matches the app's canonical course definition
-- (src/data/course-definition.fixture.json), which the app arrays + course cards
-- also match. This closes the last drift seam from ADR-0050 / stats-integrity-prd.md
-- §9: lesson_catalog drives get_network_stats core-completion counts, while the app
-- arrays drive the course cards + get_course_completion_counts — if they disagree, a
-- card and its dashboard tile silently disagree (the historical Onboarding 6→8 class).
--
-- The expected sets below are SQL literals embedded in this file. They are NOT a
-- second free-floating source: the vitest guard
-- src/test/smoke/course-definition-parity.smoke.test.ts parses the PARITY-PAIRS /
-- PARITY-PHASES blocks out of THIS file and asserts they equal the fixture JSON, so
-- the fixture, the app arrays, these literals, and the migrated DB are all locked
-- together. Change any one without the others and a CI job goes red.
--
-- Run: `supabase test db` (or pg_prove) against a DB with all migrations applied.
-- Runs in the `db-test` CI job (ADR-0024: prove invariants at their owning layer).

BEGIN;
SELECT plan(5);

-- ── Embedded canonical expectation (mirror of course-definition.fixture.json) ──
CREATE TEMP TABLE parity_expected(course_key text, lesson_id text);
-- PARITY-PAIRS-BEGIN  (course_key, lesson_id) — parsed verbatim by the vitest guard
INSERT INTO parity_expected(course_key, lesson_id) VALUES
('connect-discord','connect-discord'),
('onboarding','community-agreement'),
('onboarding','terms-conditions'),
('onboarding','terms-of-use'),
('onboarding','privacy-policy'),
('onboarding','cookie-policy'),
('onboarding','profile'),
('onboarding','onboarding-class'),
('onboarding','figma-account'),
('agile-mindset','agile-intro-1'),
('agile-mindset','agile-intro-2'),
('agile-mindset','agile-intro-3'),
('agile-mindset','agile-phil-1'),
('agile-mindset','agile-phil-2'),
('agile-mindset','agile-phil-3'),
('agile-mindset','agile-phil-4'),
('agile-mindset','agile-team-1'),
('agile-mindset','agile-team-2'),
('agile-mindset','agile-team-3'),
('agile-mindset','agile-prac-1'),
('agile-mindset','agile-prac-2'),
('agile-mindset','agile-prac-3'),
('agile-mindset','agile-prac-4'),
('agile-mindset','agile-prac-5'),
('agile-mindset','agile-cross-1'),
('agile-mindset','agile-cross-2'),
('agile-mindset','agile-cross-3'),
('agile-mindset','agile-conflict-1'),
('agile-mindset','agile-conflict-2'),
('agile-mindset','agile-conflict-3'),
('agile-mindset','agile-method-1'),
('agile-mindset','agile-method-2'),
('agile-mindset','agile-method-3'),
('agile-mindset','agile-method-4'),
('observer-course','obs-1'),
('observer-course','obs-2'),
('observer-course','obs-3'),
('observer-course','obs-4'),
('observer-course','obs-5'),
('observer-course','obs-6'),
('observer-course','obs-7'),
('observer-course','obs-8'),
('agile-teamwork','tw-intro-1'),
('agile-teamwork','tw-intro-2'),
('agile-teamwork','tw-intro-3'),
('agile-teamwork','tw-intro-4'),
('agile-teamwork','tw-learn-1'),
('agile-teamwork','tw-learn-2'),
('agile-teamwork','tw-expect-1'),
('agile-teamwork','tw-expect-2'),
('agile-teamwork','tw-expect-3'),
('agile-teamwork','tw-expect-4'),
('agile-teamwork','tw-expect-5'),
('agile-teamwork','tw-expect-6'),
('project-training','pt-intro-1'),
('project-training','pt-intro-2'),
('project-training','pt-intro-3'),
('project-training','pt-intro-4'),
('project-training','pt-apply-1'),
('project-training','pt-apply-2'),
('project-training','pt-apply-3'),
('project-training','pt-apply-4'),
('project-training','pt-apply-5'),
('project-training','pt-apply-6'),
('project-training','pt-apply-7'),
('project-training','pt-tips-1'),
('project-training','pt-tips-2'),
('project-training','pt-tips-3'),
('volunteer-teams','vt-intro-1'),
('volunteer-teams','vt-intro-2'),
('volunteer-teams','vt-work-1'),
('volunteer-teams','vt-work-2'),
('volunteer-teams','vt-work-3'),
('volunteer-teams','vt-work-4'),
('discord-learning','discord-intro-1'),
('discord-learning','discord-start-1'),
('discord-learning','discord-start-2'),
('discord-learning','discord-start-3'),
('discord-learning','discord-security-1'),
('discord-learning','discord-security-2'),
('discord-learning','discord-security-3'),
('discord-learning','discord-interact-1'),
('discord-learning','discord-interact-2'),
('discord-learning','discord-interact-3'),
('discord-learning','discord-interact-4'),
('discord-learning','discord-interact-5'),
('discord-learning','discord-roles-1'),
('discord-learning','discord-roles-2'),
('discord-learning','discord-training-1'),
('discord-learning','discord-training-2'),
('discord-learning','discord-training-3'),
('discord-learning','discord-training-4'),
('discord-learning','discord-support-1');
-- PARITY-PAIRS-END

CREATE TEMP TABLE parity_expected_phase(course_key text, phase text);
-- PARITY-PHASES-BEGIN  (course_key, phase) — parsed verbatim by the vitest guard
INSERT INTO parity_expected_phase(course_key, phase) VALUES
('connect-discord','first_steps'),
('onboarding','first_steps'),
('agile-mindset','second_steps'),
('observer-course','observer'),
('agile-teamwork','third_steps'),
('project-training','project_training'),
('volunteer-teams','volunteer'),
('discord-learning','discord_learning');
-- PARITY-PHASES-END

-- 1) Fail-closed: a gutted expectation (0 rows) must never read as a green pass.
SELECT cmp_ok(
  (SELECT count(*) FROM parity_expected)::int, '>', 0,
  'embedded course-definition expectation is populated (fail-closed)');

-- 2) KEYSTONE: the DB's active+required lessons per course EXACTLY equal the
--    canonical definition — same rows, no missing lesson, no extra lesson, none
--    assigned to the wrong course. bag_eq is a multiset compare (also catches dups).
SELECT bag_eq(
  $$ SELECT course_key, lesson_id FROM parity_expected $$,
  $$ SELECT course_key, lesson_id FROM public.lesson_catalog WHERE active AND required $$,
  'lesson_catalog active+required rows exactly match the canonical course definition'
);

-- 3) The set of courses matches course_catalog — a course added to the catalog
--    (or the fixture) without the other is caught here.
SELECT set_eq(
  $$ SELECT DISTINCT course_key FROM parity_expected $$,
  $$ SELECT course_key FROM public.course_catalog $$,
  'the canonical course set exactly matches course_catalog'
);

-- 4) Each course's phase matches the catalog (the phase the app spec also sends
--    to get_course_completion_counts).
SELECT bag_eq(
  $$ SELECT course_key, phase FROM parity_expected_phase $$,
  $$ SELECT course_key, phase::text FROM public.course_catalog $$,
  'each course phase matches course_catalog'
);

-- 5) DB internal consistency: every lesson_catalog row carries its course's phase,
--    so a lesson can never be counted under a phase its card does not use.
SELECT is_empty(
  $$ SELECT lc.lesson_id
       FROM public.lesson_catalog lc
       JOIN public.course_catalog cc ON cc.course_key = lc.course_key
      WHERE lc.phase IS DISTINCT FROM cc.phase $$,
  'every lesson_catalog.phase equals its course_catalog.phase'
);

SELECT * FROM finish();
ROLLBACK;
