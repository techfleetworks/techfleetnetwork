# ADR 0071 — Projects data-access service layer: one owner for `projects` reads, two privilege-appropriate loaders

- Status: Accepted
- Date: 2026-09-29
- Deciders: Morgan Denner
- Epic: Data access / Applicant flow
- Follows: ADR-0065 (project-application resume integrity), ADR-0056 (projects column-scoped grant), ADR-0055 (Shipathon application toggle)

## Context

`decisions.md §1` requires `UI (src/pages, src/components) → data hooks (src/hooks) → services (src/services/*.service.ts) → integrations`. `public.projects` never had that seam: **17 reads + 4 writes were inline** across pages and components (grandfathered in `arch-gate.waivers.json` under _"UI must not access the database directly"_), so every surface picked its own columns and its own read path.

Two of those readers loaded the _same_ fact — "this project" — through **two different privilege models**:

- The **apply page** (`ProjectApplicationPage`, a `ProtectedRoute`) read via the **authenticated** client with `select('*')`.
- The **public opening-detail page** (`ProjectOpeningDetailPage`, an **unauthenticated** route) read via a raw `fetch` to the **service-role** `public-project-detail` edge function (`verify_jwt = false`).

Because they were two independent loaders, they diverged — which is exactly the ADR-0065 incident: a started-but-unsubmitted draft was shown as "already submitted" on one surface, and the apply page's `select('*')` fell foul of the ADR-0056 column-scoped grant (42501 → HTTP 403), surfacing as **"Project not found"** on resume. ADR-0065 fixed the acute bug (a single-owner submission-state helper + explicit columns at all 7 authenticated reads + an arch-gate ban on `projects.select('*')`) and **explicitly deferred the structural consolidation to here**, noting it should use the authenticated client with explicit columns, not the anonymous edge function.

## Decision

**1. `projectService` (`src/services/project.service.ts`) is the ONE owner of `projects` reads for the UI.** Pages/components call a `use-project.ts` React Query hook that delegates to the service; none call `supabase.from("projects")` directly. Every column list lives in one module, so surfaces cannot drift apart again. This PR migrates the two divergent loaders (apply + public detail); the remaining read sites and the 4 writes migrate in follow-up PRs (phased), shrinking the _"UI must not access the database directly"_ waivers as each file's last direct `projects` access moves behind the service.

**2. One owner, but TWO privilege-appropriate read methods — because the surfaces have two legitimate privilege contexts.**

- `getProjectForApplication(projectId)` — **authenticated** client, RLS-scoped, explicit non-sensitive columns pinned in `PROJECT_APPLICATION_COLUMNS` (includes `is_shipathon`; excludes the four operational columns).
- `getProjectDetailPublic(projectId)` — the **service-role** `public-project-detail` edge function, for the **anonymous** opening-detail route. That route serves logged-out visitors, so it _cannot_ use the authenticated client (`anon` holds no `SELECT` on `projects`; the page would blank). The edge function owns the public projection (deliberately no `is_shipathon`, operational links omitted).

This is **not** a single physical loader — that is impossible without breaking anonymous viewing of the public page. It is **one owner and one column contract per projection**, which is what actually prevents the divergence class: the UI no longer chooses columns or read paths anywhere.

**3. Authenticated-explicit-columns for the apply path, NOT the anonymous edge function.** Routing the authenticated apply read through `public-project-detail` was rejected: it would **drop `is_shipathon`** (re-breaking the Shipathon question flow, ADR-0055), **lose RLS / `client.status` visibility semantics** (service-role bypasses grants), and add a **CORS/`x-trace-id` + GET-body + non-atomic edge-deploy** hazard. The four operational columns (`discord_role_id`, `discord_role_name`, `notion_repository_url`, `client_intake_url`) continue to come only from `get_project_internal_links` (SECURITY DEFINER) or the service-role edge function — never a direct frontend table read.

**4. The public detail read keeps the edge-fn transport, moved INTO the service as an internal `fetch` — it is NOT switched to `invokeEdge` in this change.** Switching would first require the edge function's hand-rolled CORS allow-list to add `x-trace-id` (`decisions.md §5`; `invokeEdge` attaches it, and the current inline list omits it → the preflight would fail with `FunctionsFetchError` and zero edge logs) plus a **coordinated, non-atomic** edge deploy. That is out of scope for a frontend-only, behavior-preserving refactor and is recorded as a follow-up (see Consequences).

**5. The column contract is guarded at the owner.** `src/test/services/project.service.test.ts` pins `PROJECT_APPLICATION_COLUMNS` (has `is_shipathon`, excludes each operational column, never `'*'`) and asserts each read throws rather than swallowing an error. The ADR-0065 `projects-column-scoped-reads.smoke.test.ts` suite is re-pointed to add `projectService` as the primary guarded reader while keeping the per-surface regression checks. The repo-wide arch-gate `projects.select('*')` ban (ADR-0065) is unchanged.

## Consequences

- The apply page and the public opening-detail page can no longer disagree on the `projects` column set — the column contracts have one owner each and the UI reads only through hooks.
- **Frontend-only; no DB migration** (the ADR-0056 grant is already correct and live in prod) and **no edge deploy** (the edge function is untouched).
- Behavior-preserving: the apply read keeps the same columns, the same `enabled: !!user && !!projectId` gate, and the same `["project-detail", projectId]` query key; the public detail read keeps the same payload shape and the same loading/error/"Project not found" states (the raw-`fetch` `useState` triad becomes a React Query hook keyed `["public-project-detail", projectId]` — the key the apply page already invalidates after submit).
- **Deferred, its own change:** migrating the remaining authenticated read sites and the 4 `projects` writes (`ProjectFormPage` create/update/autosave, `ProjectsTab` delete — preserving `sanitizeRecordFields` + `withBoundedSave` + the `useServerDraft` single-owner invariants) into `projectService`; and optionally switching `getProjectDetailPublic` to `invokeEdge` once the edge function sources CORS from `_shared/http.ts`. Done-signal for the epic: zero `.from("projects")` under `src/pages/**` + `src/components/**`.

## Alternatives considered

- **One physical loader on the authenticated client (both surfaces).** Rejected: the opening-detail route is public/anonymous; the authenticated client returns nothing for logged-out visitors, blanking a shareable recruitment page.
- **Consolidate both surfaces on the `public-project-detail` edge function.** Rejected per Decision 3 (drops `is_shipathon`, loses RLS/`client.status` semantics for the authenticated path, CORS/`x-trace-id`/GET-body/deploy hazards).
- **Leave the reads inline and only add a column-constant.** Rejected: it does not close the `decisions.md §1` layering divergence — the UI would still own read paths, and the two loaders could still drift.

## Verification

- `npm run check:architecture` green (no new waivers; the arch-gate `projects.select('*')` rule and the _"UI must not access the database directly"_ rule both satisfied — reads now live in `src/services/**`, which those rules do not police).
- `src/test/services/project.service.test.ts` (column contract + read behavior) and the re-pointed `src/test/smoke/projects-column-scoped-reads.smoke.test.ts` green; full `npm run test` green; typecheck + lint clean.
- `judge-arch` PASS (boundary placement, data ownership, dependency direction, error handling).
- Manual: the public opening-detail page loads for a logged-out visitor; the apply page loads and resumes a draft; a Shipathon project still drops its two questions (ADR-0055).
