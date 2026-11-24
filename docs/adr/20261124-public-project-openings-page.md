# 20261124 — Public project openings list at /project-openings (B11)

- Status: Accepted
- Date: 2026-11-24
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), B11 (§6.2)
- Related: 20261116-public-gateway-dlp-scrubtree (A4), 20261116-public-visibility-auth-aware (A5),
  20261118-public-nav-shell (B8), 20261118-shared-content-card (B9),
  20261118-public-classes-pages (B10). BUILD-PLAN Phase B.

## Context and problem statement

B11 is "projects public pages." Reconnaissance found the detail half was already
delivered under A4/A5: `/project-openings/:projectId` is **not** behind
`ProtectedRoute`, `ProjectOpeningDetailPage` reads the `public-project-detail`
gateway (anon field set, `primary_contact` PII dropped), its member-only
application-state query is `enabled: !!user`, and its Apply button already redirects
an anonymous visitor to sign-in with a return path. So the only missing surface was
the **listing**:

- `/project-openings` was wrapped in `ProtectedRoute` (member-only). A logged-out
  visitor had no way to browse openings.
- The public nav policy intentionally withheld `/project-openings` from the anon nav
  "until the public openings list ships" (owner decision 2026-11-19) — i.e. B11.

Anon already has a correct, server-enforced field set from `public-project-openings`
(PROJECT_CARD_ANON: no `phase`, no application stats, no client `kind`/`status`), so
**no gateway, allowlist, or feed-contract change is needed** — only a client that
consumes it and a page that formats it.

## Decision

- **Route-level auth branch (`ProjectOpeningsRoute`), mirroring B10's `CoursesRoute`.**
  `/project-openings` drops `ProtectedRoute` and renders the member
  `ProjectOpeningsPage` for a signed-in user or the new `PublicProjectOpeningsPage`
  for an anonymous visitor. Branching at the route keeps the 700-line member page
  **untouched** and the public page free of auth coupling, in separate lazy chunks —
  the lowest-risk way to serve one URL to both for ~767 members.
- **Keep the existing public detail page; do NOT build a second one.** The detail
  already serves anon correctly. A parallel `PublicProjectDetailPage` would duplicate
  a working surface (the data-ownership / "second way" drift the arch gate forbids).
  A Figma-matched detail *redesign* (frame `9102:187`) is a separate visual-polish
  item, not a correctness gap, and is out of B11's scope.
- **Public data through an edge-fn client hook (`usePublicProjectOpenings`), not the
  authed project service.** Anon has no table grants (A6); the gateway owns the §6
  field set, so the hook is a thin Adapter that reads it and joins the gateway's
  separate `projects` + `clients` arrays into one list. It uses a **distinct query
  key** (`["public-project-openings", "catalog"]`) from the member page's own fetch
  (`["public-project-openings"]`) so the two differently-shaped payloads never share
  a cache entry.
- **Tiles are `ContentCard` (B9); the CTA is auth-aware in the page.** "View opening"
  is a crawlable link to the public detail page; "Join Platform" carries an
  open-redirect-safe return to that opening (B8 `loginRedirectHref`). "apply" is an
  auth-gated action (public-nav-policy), so anon joins first, then applies — no apply
  surface is exposed to anon. Team hats render as the card's chips; `project_status`
  maps to a card tone (no amber/`warning` tone exists on ContentCard, so
  opening-soon/forming → neutral). Projects accepting applications sort first.
- **FR-8 states are shared, not re-copied.** The loading/error/empty state is
  extracted from `PublicCoursesPage` into one presentational `CatalogState`
  component (parameterized by the surface's join href) that both B10 and B11 use —
  one way to render these states, not a copy per page.
- **Surface `/project-openings` in the logged-out nav.** Added to `PUBLIC_NAV_HREFS`
  and `PUBLIC_NAV_ITEMS` (label "Project Openings"); the binding tests that asserted
  it was withheld are updated to assert it is now surfaced.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** one URL for both auth states; reuse the §6 gateway; one shared
  card and one shared empty/error state; no auth/data logic in the view; no duplicate
  project pages.
- **Patterns chosen:** **Strategy at the route** (auth branch), **Adapter** (edge-fn
  client hook with a client-join), **Humble view** (ContentCard + presentational page
  + shared CatalogState).
- **Candidates considered:**
  - (a) Route-level auth branch + edge-fn hook + ContentCard + shared CatalogState — chosen.
  - (b) A second, redesigned public detail page — rejected: duplicates a working
    anon-safe detail page (drift); the redesign is a separate visual item.
  - (c) A distinct public path (e.g. `/projects`) instead of branching — rejected: the
    nav, the detail route, and the member mental model already use `/project-openings`.
  - (d) Copy B10's inline CatalogState into the new page — rejected: a second way to do
    the same thing; extracted to a shared component instead.
- **Failure / rot prevented:** anon reading tables it has no grant for; a duplicate
  project detail page; auth logic in the view; a copy-pasted empty-state block;
  advertising a route that bounced anon to login.
- **Security trade-off:** opens no new data surface — every field comes from the
  Phase-A `public-project-openings` allowlist; the page only formats it. The CTA is
  open-redirect-safe and apply stays auth-gated.
- **Verify correct application:** vitest — the list renders opening tiles with team-hat
  chips, status, a View-opening link to the detail page, and a Join-Platform
  redirect-back to the specific opening; it orders accepting-applications first; empty
  and error states each show a join CTA; the hook joins client→project and leaves a
  missing client null; the nav policy/items now surface `/project-openings`.
  axe/dark-mode/responsive are `@status:planned` for the B-phase e2e.
- **Real guarantee:** the page is a formatted projection of the gateway's §6 output
  with an auth-aware CTA. It does not prove the gateway's allowlist is correct (that is
  A4/A5's tests) nor the visual parity with the Figma redesign.

## Consequences

- New: `src/pages/{PublicProjectOpeningsPage,ProjectOpeningsRoute}.tsx`,
  `src/components/CatalogState.tsx`, `usePublicProjectOpenings` in
  `src/hooks/use-public-catalog.ts`, `src/pages/public-project-openings.feature`, tests.
- Changed: `/project-openings` is now auth-branched (was `ProtectedRoute`);
  `PublicCoursesPage` now consumes the shared `CatalogState`; the nav policy/items and
  their binding tests surface `/project-openings`.
- `ProjectOpeningsPage` (member), `ProjectOpeningDetailPage` (public detail), and the
  `public-project-openings`/`public-project-detail` gateways are unchanged.
- No DB migration and no gateway/allowlist change — the anon field set already existed.
- A Figma-matched detail redesign (`9102:187`), a client-logo treatment on tiles, and
  C14 prerender/sitemap for the public project routes remain follow-ups.
