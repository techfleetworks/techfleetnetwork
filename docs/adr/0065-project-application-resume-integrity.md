# ADR 0065 — Project-application resume integrity: explicit `projects` columns + status-derived submission state

- Status: Accepted
- Date: 2026-09-28
- Deciders: Morgan Denner
- Epic: Applicant flow / Data access

## Context

A member who **started but had not submitted** a project application (a draft) returned to finish it and hit two failures at once on a mission-critical flow:

1. **"Project not found."** on the application form — they could not finish.
2. **"You've already submitted an application" / "Applied"** on the project detail page and the openings list — they were told they had finished when they had not.

Both are symptoms of the same anti-pattern `decisions.md §1` forbids: the applicant flow derived two facts — _"can this member load this project"_ and _"has this member applied"_ — in an ad-hoc way at each surface, so the surfaces disagreed with each other and with the database.

### Root cause A — a draft was counted as a submission

The detail page ([`ProjectOpeningDetailPage.tsx`](../../src/pages/ProjectOpeningDetailPage.tsx)) and the openings list ([`ProjectOpeningsPage.tsx`](../../src/pages/ProjectOpeningsPage.tsx)) decided "applied?" from **row existence** (`hasApplied = !!existingApp` / a `Set` of `project_id`), with no `status` check. But a `project_applications` row is created and autosaved the moment an applicant _starts_, so an abandoned draft looked identical to a submitted application. The real signal — used by the apply page (`isCompleted = existingApp?.status === 'completed'`), the `public-project-detail` "Applications Submitted" count (`status = 'completed'`), and `ApplicationStatusBadge` (draft → "In Progress" vs completed → "Submitted") — was bypassed.

### Root cause B — `select('*')` on a column-scoped table

The apply page loaded the project with `supabase.from("projects").select("*")…single()` as the **`authenticated`** role. ADR-0056 (`20260922120000`) made `public.projects` **column-scoped** for `authenticated` (no table-level `SELECT`; per-column `SELECT` on every column except the four operational ones). Per PostgreSQL and PostgREST — and Supabase's own Column-Level Security docs ("_using `select *` will fail … you must specify the column names explicitly_") — `select=*` expands to **all** columns and runs as the requesting role, so it fails **`42501` → HTTP 403**. The read errored, `.single()` threw, and the page rendered "Project not found." The detail page survived only because it reads through the **service-role** `public-project-detail` edge function, which bypasses grants — so the two surfaces disagreed. The same fragile pattern existed at **seven** authenticated `select("*")` reads of `projects` (two user-facing: the apply page and "My Applications"; five admin), all of which fail identically once the grant is applied.

## Decision

**1. Every frontend read of `public.projects` names its columns explicitly — never `select('*')`.**
List exactly the non-sensitive columns the surface renders. The four operational columns (`discord_role_id`, `discord_role_name`, `notion_repository_url`, `client_intake_url`) come only from the `get_project_internal_links` RPC (SECURITY DEFINER) or the service-role `public-project-detail` edge function — never a direct table read. `is_shipathon` (granted to `authenticated` by `20260921120000`) is included wherever the Shipathon question set (ADR-0055) depends on it. This is **grant-immune** (works whether or not `20260922120000` is applied to prod) and **RLS-preserving** (row visibility is unchanged), so it is safe under either production grant state.

**2. "Has this member submitted?" derives from `status === 'completed'`, never from row existence.**
A single pure owner, [`getProjectApplicationSubmissionState(row) → 'none' | 'draft' | 'completed'`](../../src/lib/applications/project-application-status.ts), is the source every surface consumes. A draft offers **"Resume"**; only a completed application shows "Submitted"/"Edit". It is fail-safe by construction: only the exact string `'completed'` counts as submitted, so a missing/unknown status on an existing row resolves to `draft` and the UI never falsely claims the applicant finished.

**3. A mechanical guard makes RC-B unrepeatable.**
`arch-gate.config.json` forbids `supabase.from("projects").select("*")` under `src/**` (whole-file regex; catches single-line and multiline chains; scoped to `projects` so `select('*')` on other tables stays legal). Proven by discriminating tests in `src/test/smoke/arch-gate.smoke.test.ts` (AG-008/009 fire on the regression, AG-010 stays quiet on the fix).

## Consequences

- The resume path loads again, under either prod grant state; the incident's live trigger is confirmed by the owner running the one-line `has_column_privilege` check (below) — the code fix does not depend on the answer, but the _claim_ that ADR-0056's grant caused it does.
- Drafts surface as "Resume" everywhere; the false "you already submitted" is gone, and the detail page no longer contradicts its own "Applications Submitted: 0".
- The seven `select("*")` reads are now grant-safe; the guard blocks the eighth.
- Not done here (deferred, its own change): collapsing the detail + apply project reads into one shared loader to fully close the `decisions.md §1` layering divergence. If pursued, it should use the **authenticated client with explicit columns**, not the public service-role edge function — routing the authenticated apply page through the anon endpoint would drop `is_shipathon` (re-breaking ADR-0055), lose RLS/`client.status` semantics, and add a CORS/`x-trace-id` + GET-body + non-atomic-edge-deploy hazard.

## Verification

- Owner confirms the live RC-B trigger (read-only): `select has_column_privilege('authenticated','public.projects','discord_role_id','SELECT') as leaks_sensitive, has_column_privilege('authenticated','public.projects','is_shipathon','SELECT') as can_read_flag;` — `leaks_sensitive = false` ⇒ ADR-0056 grant is live ⇒ the `select('*')` 403 was the cause.
- `src/test/lib/project-application-status.test.ts` (helper), `src/test/smoke/arch-gate.smoke.test.ts` AG-008..010 (guard), the existing pgTAP grant suites, `npm run check:architecture`, and `judge-arch` all green.
- Manual: as a member with a draft — the detail page shows **Resume** (not "submitted"); resuming loads the apply page (no "Project not found"); "My Applications" loads.
