-- pgTAP: public.projects sensitive columns are unreadable by `authenticated` (ADR-0056).
--
-- Proves the fix for the column-REVOKE-no-op leak. The four operational columns must NOT be
-- SELECT-able by `authenticated` via direct table access (they flow only through the roster/admin
-- gated get_project_internal_links RPC), while the rest of the table stays readable so the app
-- keeps working, and anon has no SELECT at all. This suite FAILS on the pre-fix schema — where the
-- column REVOKE was a no-op and has_column_privilege(...) returned true — so it is a genuine
-- red -> green proof. Run: `supabase db test`. Rolled back at the end.

BEGIN;
SELECT plan(8);

-- ── The four sensitive columns: authenticated must NOT hold column SELECT ──────────────────
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.projects', 'discord_role_id', 'SELECT'),
  'authenticated cannot SELECT projects.discord_role_id'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.projects', 'discord_role_name', 'SELECT'),
  'authenticated cannot SELECT projects.discord_role_name'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.projects', 'notion_repository_url', 'SELECT'),
  'authenticated cannot SELECT projects.notion_repository_url'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.projects', 'client_intake_url', 'SELECT'),
  'authenticated cannot SELECT projects.client_intake_url'
);

-- ── Non-sensitive columns stay readable by authenticated (the app still works) ─────────────
SELECT ok(
  has_column_privilege('authenticated', 'public.projects', 'id', 'SELECT'),
  'authenticated can still SELECT projects.id'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.projects', 'is_shipathon', 'SELECT'),
  'authenticated can still SELECT projects.is_shipathon'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.projects', 'requires_interview', 'SELECT'),
  'authenticated can still SELECT projects.requires_interview'
);

-- ── anon has no SELECT on projects at all (reads go via the service-role edge function) ─────
SELECT ok(
  NOT has_column_privilege('anon', 'public.projects', 'id', 'SELECT'),
  'anon cannot SELECT projects'
);

SELECT * FROM finish();
ROLLBACK;
