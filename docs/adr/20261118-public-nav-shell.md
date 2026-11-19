# 20261118 — Single-URL, auth-conditional public navigation shell (B8)

- Status: Accepted
- Date: 2026-11-18
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access), B8 (§6.2, §6.4)
- Related: 20261116-public-visibility-auth-aware (A5, the policy seam this consumes);
  BUILD-PLAN Phase B. Full design: `docs/public-access/ENTERPRISE-ARCHITECTURE.md`.

## Context and problem statement

Phase A made the public data safe to serve; B8 is the first UI: give a logged-out
visitor a real navigation shell so the public pages (B10–B12) have a frame. Today
`AppLayout` renders anon a bare header (logo + a single "Connect" button) with no
nav at all. The ticket wants the SAME route to serve both auth states (a shared
link opens the same page logged in or out), with logged-out items (Home, Courses,
Project Openings) and auth-gated actions that send anon to sign in and back.

Two product decisions were owed and are now made (owner, 2026-11-18):
- Logged-out auth CTAs = **"Sign In" + "Join Platform"** (spec §6.4), replacing the
  single "Connect".
- The catalog nav item is **"Courses"** (route `/courses` unchanged), not "Classes".

## Decision

- **One shell, two shapes by auth state, same URL.** `AppLayout` branches: auth-flow
  routes (login/register/reset) get minimal chrome; a logged-out visitor on any
  other route gets the public nav shell; authed members get the full app. The URL
  never changes with auth state — only the chrome does.
- **A dedicated `PublicSidebar`, not a reuse of `AppSidebar`.** `AppSidebar` runs
  auth/admin/teacher hooks and a pending-classes query that must never execute for
  an anonymous visitor. `PublicSidebar` carries only the public items and no
  auth-coupled logic. This is a boundary (data ownership / dependency direction),
  not duplication: the two sidebars own different concerns.
- **Nav items single-sourced** in `PublicNavItems.ts`; a test binds every href to
  the A5 policy (`isPublicPath`), so a non-public route can never enter the
  logged-out nav. The policy stays the source of truth for *what is public*; the UI
  list is its labeled projection.
- **Redirect-back reuses the existing open-redirect guard.** `auth-gated-redirect.ts`
  builds `/login?redirect=…` / `/register?redirect=…` via
  `normalizeSafeRedirectTarget` (same guard the sign-in/register engines already
  use), so Sign In / Join Platform return the visitor to the current page and a
  crafted return path cannot bounce them off-origin (OWASP Unvalidated Redirects).

## Pattern-decision record

- **Problem / forces:** serve both auth states on one URL; do not run authed-only
  data access for anon; keep "what is public" in one place; outward-facing auth copy;
  the shell is the substrate for every B-phase public page.
- **Candidates considered:**
  - (a) **Dedicated public shell + sidebar, policy-bound nav, reuse the redirect
    guard** — chosen.
  - (b) Reuse `AppSidebar` with an `if (!user)` public branch — rejected: it would run
    `useAdmin`/`useTeacher`/the pending-classes query for anon (needless work + a
    wrong dependency), and entangle public and authed nav in one component.
  - (c) A separate set of `/public/*` routes/URLs — rejected: breaks the single-URL
    requirement (a shared link must open the same page for anyone).
- **Decision:** (a) — a thin presentation shell over the A5 Strategy policy; visibility
  stays a business rule in the policy, the shell only reflects it (ADR-20261116).
- **Pros / cons accepted:** Pro — one URL, one policy source, no authed data access for
  anon, open-redirect-safe. Con — a second (small) sidebar component to keep visually
  in step with `AppSidebar`.
- **Failure / rot prevented:** a non-public route leaking into the logged-out nav
  (policy-bound test); authed-only queries firing for anon; an open-redirect via the
  return path; two copies of "what is public" drifting.
- **Security trade-off:** opens no data surface (presentation only; Phase A guards the
  data). Closes the open-redirect vector on the new CTAs. Per-action gating
  (Apply/Register on a page) lands with B10/B11 — not built here, as no page renders
  those actions yet (no dead code).
- **Verify correct application:** vitest — the logged-out shell shows the public items
  + CTAs and NO authed-only items; redirect-back builders are same-origin only
  (discriminating off-origin/protocol-relative cases); nav↔policy binding. `@a11y`
  and same-URL-parity scenarios are `@status:planned` for e2e in Phase B.
- **Real guarantee:** the logged-out nav is a projection of the A5 policy, bound by a
  test; the CTAs cannot redirect off-origin. It does not by itself prove every page
  renders identically across auth states — that is the B10–B12 page work.

## Consequences

- `AppLayout` now has three shells (auth-flow minimal / public / authed). The old
  all-anon bare header is replaced for content pages; auth pages keep minimal chrome.
- New: `PublicSidebar.tsx`, `PublicNavItems.ts`, `auth-gated-redirect.ts`. `AppSidebar`
  is unchanged (still authed-only).
- B9 (shared card) and B10–B12 (public pages) render inside this shell. Per-action
  redirect-back gating is wired on those pages, consuming `isAuthGatedAction` + these
  builders.
- Open design items still owed before/through B10–B12 (not blocking B8): class-detail
  "Schedule" section with no backing field, footer nav vocabulary, top-bar CTA wording
  on the class-detail prototype (now unified to Sign In / Join Platform here).
