# ADR 0056 — Enforce column-level SELECT on public.projects (close the no-op-REVOKE leak)

- Status: Accepted
- Date: 2026-09-22
- Deciders: Morgan Denner
- Epic: Security / Data access

## Context

Migration `20260513025458` set out to hide four operational columns on `public.projects` —
`discord_role_id`, `discord_role_name`, `notion_repository_url`, `client_intake_url` — from the
`anon` and `authenticated` roles, so they'd be reachable only through the roster/admin-gated
`get_project_internal_links` RPC. It did:

```sql
REVOKE SELECT (discord_role_id, discord_role_name, notion_repository_url, client_intake_url)
  ON public.projects FROM anon, authenticated;
-- comment: "After revoke, PostgREST's select=* silently excludes them for anon/authenticated."
```

That comment is wrong for `authenticated`. `authenticated` holds **table-level** `SELECT` on
`public.projects` from Supabase's bootstrap grant, and it was never revoked (only `anon` got
`REVOKE ALL`, in `20260322030225`). In PostgreSQL, **a column-level `REVOKE` against a role that
holds table-level `SELECT` is a no-op** — it emits `WARNING: no privileges could be revoked for
column …` and the table grant still covers every column. So all four columns stayed readable by any
signed-in member via `projects.select('*')` — an authorization leak of internal operational data
(Discord role IDs, Notion/client intake URLs).

Confirmed by exhaustive audit of every `GRANT`/`REVOKE` on `projects` across all migrations: the
only `authenticated` SELECT change is that column-level `REVOKE`; table-level `SELECT` is never
removed. (Empirically consistent with the shipped app reading grant-less columns like
`requires_interview` as `authenticated` in prod.)

Blast radius of _fixing_ it is nil for legitimate flows: every reader of these four already goes
through the `get_project_internal_links` RPC (`MyProjectsTab`, `RosterApplicantDetailPage`,
`ApplicantStatusDropdown`, `ProjectFormPage`) or the service-role `public-project-detail` edge
function. The code was already written assuming the revoke worked — only the revoke didn't.

## Decision

Make the restriction real by switching `authenticated` to a **column-scoped** SELECT on
`public.projects` (migration `20260922120000`): revoke the table-level `SELECT`, then grant `SELECT`
on every column **except** the four sensitive ones. The allowed list is computed from the live table
inside a `DO` block, so it cannot drift from a hardcoded copy and picks up any column not reflected
in generated types. The `REVOKE` + `GRANT` run in one `DO` block (atomic — `authenticated` is never
left with no SELECT), with a fail-closed guard if enumeration returns nothing. `anon` needs no change
(already `REVOKE ALL`); `service_role` and the SECURITY DEFINER RPC bypass grants.

Proven by pgTAP (`supabase/tests/projects_sensitive_column_grant_test.sql`, run in `db-test`):
the four columns are unreadable by `authenticated`, the rest stay readable, `anon` has none. The
suite fails on the pre-fix schema — a genuine red → green proof.

**New contract:** `public.projects` is now column-scoped for `authenticated`. A future NON-sensitive
column must `GRANT SELECT (<col>) ON public.projects TO authenticated` in its own migration (as
`20260921120000` did for `is_shipathon`); a sensitive one is simply left out. Encoded in
`supabase/migrations/CLAUDE.md`.

## Alternatives considered

- **Hardcode the allowed column list in the migration.** Rejected: it silently drifts from the real
  table (a column present in prod but missing from the list becomes unreadable, breaking reads). The
  dynamic enumeration is drift-proof.
- **Expose `authenticated` to a view that omits the sensitive columns; revoke the base table.**
  Rejected as far too invasive — every client `from('projects')` call would have to be repointed at
  the view. The column-scoped grant is the Supabase-idiomatic column-security mechanism and needs no
  client change.
- **Leave it (rely on the client not selecting the columns).** Rejected: the data is still
  retrievable by a crafted request; the client not asking is not access control.

## Consequences

**Positive**

- The four operational columns are no longer readable by signed-in members via direct table select;
  access is only through the gated RPC / service-role edge function, matching the original intent.
- No legitimate flow changes — every reader already used the RPC/edge function.
- The invariant is pinned by pgTAP and can't silently regress.

**Negative / accepted**

- `public.projects` is now column-scoped for `authenticated`: **new non-sensitive columns must be
  granted explicitly** or they won't be readable. This is the same obligation `is_shipathon` already
  met; it's encoded in `supabase/migrations/CLAUDE.md` and pinned by the readability side of the
  pgTAP test. `has_column_privilege` / `\dp` output for `projects` is now busier (column-scoped ACL).
- **Deploy ordering:** hand-apply `20260922120000` to prod (`supabase db push` / SQL editor). This
  one is _tightening_ access, so unlike an additive column it's safe to apply before or after the
  (no-op) frontend — there is no frontend change in this PR. `db-test` is informational (not in the
  gate aggregator), so the pgTAP proof runs in CI but does not by itself block merge.
- A separate latent question this surfaced — whether the same table-vs-column grant model affects
  other tables' column REVOKEs — is out of scope here.
- **Load-bearing assumption to verify at apply time:** the whole table relies on PostgREST expanding
  an authenticated `select('*')` to only the _granted_ columns rather than erroring on the ungranted
  ones. This is documented PostgREST behavior and exactly what `20260513025458` assumed — but because
  that REVOKE was a no-op, the excluded-column state has never actually run live for `projects`. After
  the prod `db push`, immediately confirm with one authenticated `projects.select('*')` read (via the
  app or an ordinary-user JWT) that it returns rows with the four columns absent — not an error. The
  pgTAP suite proves the grants but cannot drive PostgREST, so it does not cover this. Instant
  rollback if wrong: re-grant table-level SELECT to `authenticated`.
