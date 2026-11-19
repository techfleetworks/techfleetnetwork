-- public-access A8: close DIRECT anonymous PostgREST access to the Core-course
-- catalog (System A: course_catalog + lesson_catalog).
--
-- These tables already enable RLS with only a `SELECT TO authenticated` policy,
-- so anon reads no rows today. This REVOKE removes the table-level GRANT too, so
-- `has_table_privilege('anon', ...)` is false — the identical D-A lockdown A6
-- applied to classes/cohorts. The only anon read path becomes the service-role
-- gateway (public-courses), which applies the §6 course/lesson allowlist. A column
-- added to either table can no longer reach anon via a raw `select=*`.
--
-- `authenticated` KEEPS its grants + RLS policy (the logged-in journey reads the
-- catalog via use-course-catalog-prep); only `anon` is revoked. Idempotent.
--
-- ⚠ ORDERING: apply ONLY AFTER the public-courses service-role gateway is deployed.
-- (The whole public-access branch deploys together at Phase B, so apply with it.)

REVOKE ALL ON public.course_catalog FROM anon;
REVOKE ALL ON public.lesson_catalog FROM anon;
