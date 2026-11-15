-- pgTAP: no anon/public RLS policy may reference has_role (DB-1 / re-audit RP-I, batch 4).
--
-- WHY. public.has_role(uuid, app_role) is a SECURITY DEFINER authz helper that we intend to revoke
-- anon EXECUTE on (DB-1 burndown). An RLS policy's USING/WITH CHECK expression is evaluated as the
-- *querying* role, so if a policy that applies to `anon` (or the PUBLIC group, which includes anon)
-- references has_role, revoking anon's EXECUTE turns that query into `permission denied for function`.
-- Batch 4 tightened the 9 known implicit-PUBLIC has_role policies to `TO authenticated`; this test
-- locks that invariant so a regression (a new no-`TO`-clause or `TO anon`/`TO public` policy that
-- calls has_role) is caught, and so the eventual anon-revoke on has_role (a later batch) stays safe.
--
-- A no-`TO`-clause policy is stored with roles = {public}; the `roles && {anon,public}` overlap catches
-- both that default-PUBLIC case and an explicit `TO anon`/`TO public`. Scope: all schemas (storage.objects
-- has_role policies are TO authenticated and correctly excluded). This file runs in the (currently
-- informational, not a required check) db-test suite; db-test also runs when supabase/tests/ changes.
-- The load-bearing guard is the in-migration self-check #2 in 20261111000000, which runs at prod apply.
-- LIMITATION: this matches has_role by NAME in a policy's own qual/with_check text. It does NOT catch a
-- policy that reaches has_role TRANSITIVELY (via a SECURITY INVOKER function or security_invoker view) — the
-- token is not in the policy text. The has_role anon-revoke batch must additionally scan pg_proc.prosrc of
-- SECURITY INVOKER functions / security_invoker views for has_role (the current transitive vector is clear).
BEGIN;
SELECT plan(1);

-- Diagnostic: the exact offending policies, if any (so a regression is seeded/burned down from CI).
SELECT diag(
  'anon/public RLS policies referencing has_role: ' ||
  COALESCE(
    string_agg(
      schemaname || '.' || tablename || ' "' || policyname || '" [' || array_to_string(roles, ',') || ']',
      '; ' ORDER BY schemaname, tablename, policyname
    ),
    '(none)'
  )
)
FROM pg_policies
WHERE roles && ARRAY['anon','public']::name[]
  AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%has_role%';

SELECT is(
  (SELECT count(*)::int
     FROM pg_policies
    WHERE roles && ARRAY['anon','public']::name[]
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%has_role%'),
  0,
  'no anon/public RLS policy references has_role (prerequisite for revoking anon EXECUTE on has_role, DB-1)'
);

SELECT * FROM finish();
ROLLBACK;
