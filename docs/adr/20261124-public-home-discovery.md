# 20261124 — Public home landing page offers discovery links into the public surfaces (B13)

- Status: Accepted
- Date: 2026-11-24
- Deciders: product owner (mdenner), engineering
- Ticket: public-access, B13 (§6.4)
- Related: 20261118-public-courses-gateway (A8), 20261118-public-classes-pages (B10),
  20261124-public-project-openings-page (B11). BUILD-PLAN Phase B.

## Context and problem statement

A logged-out visitor lands on `/` (the public `LandingPage`; `Index.tsx` sends an authed
user to `/dashboard`, so the landing page is anon-only). Its only calls to action were
"Get Started" (→ `/register`) and an external "Training Overview". The two public surfaces
shipped in B10 and B11 — the free **Courses** catalog (`/courses`) and the **Project
Openings** list (`/project-openings`) — were reachable only from the logged-out nav. A
visitor who scans the page body, not the nav rail, had no concrete path *into* the content
they can actually browse without an account. B13 closes that: the landing page itself links
into the public surfaces.

## Decision

- **Add a discovery section to the landing page** (below the hero, above Features) with one
  card per public surface, each card a single `<Link>` into that surface (`/courses`,
  `/project-openings`).
- **Routes stay single-sourced in `PUBLIC_NAV_ITEMS`.** The discovery cards are a projection
  of `PUBLIC_NAV_ITEMS` (the A5/B8 nav-policy source) filtered to the non-Home entries:
  `DISCOVERY_ITEMS = PUBLIC_NAV_ITEMS.filter((i) => DISCOVERY_COPY[i.href])`. The landing page
  does **not** re-declare which routes are public; it only adds presentational copy
  (`DISCOVERY_COPY`, a `Record<href, {heading, blurb}>`) and reuses the nav item's icon. One
  owner of "which routes are public," so the discovery links cannot drift from the policy.
- **The page formats only.** No data access, no business logic — pure presentation and
  navigation, consistent with ADR-20261116 (presentation reflects visibility, never decides
  it).
- **A missing-copy card cannot render broken.** Because an item is in `DISCOVERY_ITEMS` only
  when `DISCOVERY_COPY[href]` is truthy (filter-then-lookup), the copy is provably defined at
  render; an unmapped nav href renders no card rather than a broken one.

## Pattern-decision record (pattern-selector)

- **Problem / forces:** give anon a path into the public surfaces from the landing body;
  do not create a second list of public routes that can drift from the nav/policy; no data
  access on the landing page.
- **Pattern chosen:** Humble View over a single source — the page projects `PUBLIC_NAV_ITEMS`
  and annotates it with presentational copy. No new service, no new policy.
- **Candidates considered:**
  - (a) Derive cards from `PUBLIC_NAV_ITEMS`, annotate with copy keyed by href — chosen.
  - (b) Hardcode two `<Link>`s to `/courses` and `/project-openings` — rejected: a third
    place owning the public-route list, free to drift from nav/policy.
  - (c) Make the existing Feature cards link — rejected: the feature copy is generic
    marketing, not a 1:1 map to the two browsable surfaces, and would conflate the two.
- **Failure / rot prevented:** a public surface a visitor can't find from the home body; a
  second, drifting list of public routes.
- **Verify correct application:** vitest — the landing page renders the discovery section and
  its links equal **exactly** the non-Home `PUBLIC_NAV_ITEMS` hrefs (policy binding: a renamed
  or newly-public route that lacks discovery copy fails the test).
- **Real guarantee:** the discovery section links exactly the routes the public nav exposes
  (minus Home). It does not guarantee the marketing copy is optimal — that is authored content.

## Consequences

- Changed: `src/pages/LandingPage.tsx` (discovery section + `DISCOVERY_COPY`/`DISCOVERY_ITEMS`).
- New: `src/pages/public-home-discovery.feature`; discovery tests in
  `src/test/ui/LandingPage.test.tsx` incl. the policy-binding test.
- Nav/policy unchanged — B13 consumes `PUBLIC_NAV_ITEMS`, it does not alter the public-route
  set. When a future public surface joins the nav, add a `DISCOVERY_COPY` entry for it (the
  policy-binding test flags the omission).
- Heading hierarchy: the new section uses `PageTitle` (h1), matching the sibling Features
  section; the page's pre-existing multiple-h1 structure is unchanged and out of B13 scope.
