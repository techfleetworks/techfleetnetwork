-- Make the sensitive-column REVOKE on public.projects actually effective (ADR-0056).
--
-- Migration 20260513025458 tried to hide four operational columns — discord_role_id,
-- discord_role_name, notion_repository_url, client_intake_url — from anon/authenticated with a
-- COLUMN-level REVOKE, with a comment claiming "PostgREST's select=* silently excludes them".
-- But `authenticated` holds TABLE-level SELECT on public.projects (Supabase bootstrap grant,
-- never revoked; only anon got REVOKE ALL in 20260322030225). In PostgreSQL a column-level
-- REVOKE against a role that holds table-level SELECT is a NO-OP (it emits
-- "WARNING: no privileges could be revoked for column ..."), so those four columns remained
-- readable by any signed-in member via projects.select('*') — contrary to the migration's intent.
--
-- Every legitimate reader already fetches these four through the roster/admin-gated
-- get_project_internal_links RPC (SECURITY DEFINER) or the service-role public-project-detail edge
-- function — see MyProjectsTab, RosterApplicantDetailPage, ApplicantStatusDropdown, ProjectFormPage.
-- So enforcing the restriction changes no legitimate flow; it only closes the direct-select leak.
--
-- Fix: drop authenticated's table-level SELECT and re-grant SELECT on every column EXCEPT the four
-- sensitive ones. The allowed list is computed from the live table so it can never drift from a
-- hardcoded copy (and so it picks up any column not reflected in generated types). anon already has
-- no table privileges, so it needs no change. service_role and the SECURITY DEFINER RPC bypass
-- grants and are unaffected. The REVOKE + GRANT run inside one DO block, so they apply atomically —
-- authenticated is never left with no SELECT.
--
-- CONTRACT FOR FUTURE MIGRATIONS: public.projects is now COLUMN-SCOPED for `authenticated`. A newly
-- added NON-sensitive column is NOT auto-readable — its migration must
--   GRANT SELECT (<col>) ON public.projects TO authenticated;
-- exactly as 20260921120000 did for is_shipathon. A new SENSITIVE column is simply left out (and, if
-- the table were ever to revert to table-level SELECT, re-run this enforcement). See
-- supabase/migrations/CLAUDE.md and ADR-0056.

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'projects'
    AND column_name NOT IN (
      'discord_role_id', 'discord_role_name', 'notion_repository_url', 'client_intake_url'
    );

  -- Fail closed: never leave `authenticated` with zero SELECT on projects.
  IF v_cols IS NULL OR length(btrim(v_cols)) = 0 THEN
    RAISE EXCEPTION 'projects column enumeration returned no non-sensitive columns — refusing to revoke';
  END IF;

  EXECUTE 'REVOKE SELECT ON public.projects FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.projects TO authenticated', v_cols);
END $$;
