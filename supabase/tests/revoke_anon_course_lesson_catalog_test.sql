-- pgTAP: after the A8 REVOKE, the anon role has NO privileges on the Core-course
-- catalog tables, so the only way an anonymous visitor can read course data is
-- through a service-role gateway (public-courses), which applies the §6 allowlist.
-- `authenticated` KEEPS its SELECT (the logged-in journey). Run: `supabase db test`.
BEGIN;
SELECT plan(6);

-- Exactly-zero privileges for anon on each table (the System A lockdown).
SELECT table_privs_are(
  'public', 'course_catalog', 'anon', ARRAY[]::text[],
  'anon has no privileges on public.course_catalog'
);
SELECT table_privs_are(
  'public', 'lesson_catalog', 'anon', ARRAY[]::text[],
  'anon has no privileges on public.lesson_catalog'
);

-- And explicitly: anon cannot SELECT (the leak the gateway closes).
SELECT ok(
  NOT has_table_privilege('anon', 'public.course_catalog', 'SELECT'),
  'anon cannot SELECT public.course_catalog'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lesson_catalog', 'SELECT'),
  'anon cannot SELECT public.lesson_catalog'
);

-- authenticated is UNAFFECTED (the logged-in journey still reads the catalog).
SELECT ok(
  has_table_privilege('authenticated', 'public.course_catalog', 'SELECT'),
  'authenticated can still SELECT public.course_catalog'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.lesson_catalog', 'SELECT'),
  'authenticated can still SELECT public.lesson_catalog'
);

SELECT * FROM finish();
ROLLBACK;
