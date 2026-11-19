# 20261118 — Public classes pages: catalog at /courses + class detail at /classes/:slug (B10)

- Status: Accepted
- Date: 2026-11-18
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), B10 (§6.1/6.2/6.3)
- Related: 20261116-public-class-gateway (A3), 20261118-public-courses-gateway (A8),
  20261118-public-nav-shell (B8), 20261118-shared-content-card (B9), 20261118-public-domain-bounded-contexts.
  BUILD-PLAN Phase B.

## Context and problem statement

Phase A made the class/course data safe to serve (the `public-classes`,
`public-class-detail`, `public-courses` gateways own the §6 allowlist). B10 is the
first public pages that consume them: a catalog and a class detail a logged-out
visitor can browse. Two things were in the way:

- `/courses` already renders the logged-in `TrainingPage` (a progress-rich hub)
  behind `ProtectedRoute`, and the nav "Courses" item points there. There was no
  public classes route at all; `TrainingPage` even links classes to `/classes/:slug`,
  a route that did not exist (a dead link for members).
- Anon has no table grants after the A6 REVOKE, so the public pages cannot use the
  authed `ClassService` hooks; they must read through the gateways.

Two owner decisions (2026-11-18) shaped the build:
- **/courses is one URL for everyone, auth-aware.** A signed-in member keeps the
  progress/locking/completion hub (TrainingPage); an anonymous visitor gets the
  public catalog. Same URL, auth-appropriate content.
- **The class "schedule" is the cohort itself** (dates, and timezone for members) —
  there is no separate schedule field, so the detail page renders cohort data.

## Decision

- **Route-level auth branch (`CoursesRoute`).** `/courses` drops `ProtectedRoute`
  and renders `TrainingPage` for a signed-in member or `PublicCoursesPage` for an
  anonymous visitor. Branching at the route keeps the member page **untouched** and
  the public page free of auth coupling — the lowest-risk way to honor "auth-aware
  catalog" for ~767 members without rewriting TrainingPage. `/curriculum` (an authed
  alias of TrainingPage) is unchanged.
- **Public class detail at `/classes/:slug`, public (no `ProtectedRoute`).** It
  consumes `public-class-detail`; anon and members both read it (members additionally
  see cohort status/capacity/timezone). This also fixes TrainingPage's previously-dead
  `/classes/:slug` link.
- **Public data through edge-fn client hooks (`use-public-catalog`), not
  `ClassService`.** Anon has no grants post-A6; the gateway is the one place the §6
  field set is enforced, so the hooks are thin adapters over it (Adapter pattern).
- **Tiles are `ContentCard` (B9); auth-aware CTAs live in the page.** Anon class
  tiles: "View details" (in-app SPA navigation) + "Join Platform" (B8 redirect-back).
  The cohort CTA on the detail page is the one auth-aware decision: anon → Join
  Platform (the readiness path is "join, then register"), member → Register on
  Gumroad (the external `registration_url`).
- **Free text is rendered as plain text, never raw HTML.** `summary`/`description`/
  `curriculum` go through `stripHtml`; the gateway also DLP-scrubs them. No
  `dangerouslySetInnerHTML` of teacher-authored prose (XSS).

## Pattern-decision record (pattern-selector)

- **Problem / forces:** one URL for both auth states with different content; reuse the
  §6 gateways; one shared card; no auth/data logic leaking into the view; no raw HTML.
- **Patterns chosen:** **Strategy at the route** (auth branch), **Adapter** (edge-fn
  client hooks), **Humble view** (ContentCard + presentational pages).
- **Candidates considered:**
  - (a) Route-level auth branch + edge-fn hooks + ContentCard — chosen.
  - (b) Merge the public catalog INTO TrainingPage (one component, auth-forked
    internally) — rejected for now: a risky rewrite of a 487-line member page for 767
    users; the route branch delivers the same UX with far less blast radius.
  - (c) A separate `/classes` catalog route and leave `/courses` member-only —
    rejected: the owner chose one `/courses` URL for everyone, and the nav already
    points there.
- **Failure / rot prevented:** a dead `/classes/:slug` link; anon reading tables it
  has no grant for; a second class card; auth logic in the view; stored-XSS via
  teacher HTML.
- **Security trade-off:** opens no new data surface — every field comes from a Phase-A
  gateway's §6 allowlist; the page only formats it. CTAs are open-redirect-safe (B8).
- **Verify correct application:** vitest — the catalog renders course/class tiles with
  the right CTAs (Join carries a redirect-back href; View details navigates in-app);
  empty states show a join CTA; the detail page renders the class + cohort schedule,
  anon sees Join-to-register while a member sees Register-on-Gumroad, and a missing
  slug shows not-found. SEO tags are asserted; axe/dark-mode/responsive are
  `@status:planned` for the B-phase e2e.
- **Real guarantee:** the pages are a formatted projection of the gateways' §6 output,
  with auth-aware CTAs. They do not prove the gateways' allowlist is correct (that is
  A3/A8's tests) nor that every field renders identically across auth states.

## Consequences

- New: `src/pages/{PublicCoursesPage,PublicClassDetailPage,CoursesRoute}.tsx`,
  `src/hooks/use-public-catalog.ts`, `src/pages/public-classes.feature`, tests.
- `/courses` is now public (auth-branched); `/classes/:slug` is a new public route.
  `TrainingPage` and `/curriculum` are unchanged.
- **Onboarding Courses tab** lists the free Core courses via A8 (outline only); the
  tiles' "Join Platform" returns to `/courses` (the per-course content pages become
  public in B12). **B11** (projects) and **B12** (home + Core course pages) follow.
- The route must deploy before the public nav's "Courses" link stops redirecting anon
  to sign-in. Prod edge functions (public-classes/-class-detail/-courses) and the A6/A8
  REVOKE migrations still apply per the Phase-A deploy order.
- Open design items still owed (not blocking B10): footer nav vocabulary; a
  contrast-tuned amber "opening soon" tone (B9 follow-up).
