# 20261116 — Public visibility: auth-aware gateway Strategy (A5)

- Status: Accepted
- Date: 2026-11-16
- Deciders: product owner (mdenner), engineering
- Ticket: 34c1a3bddce58092864bc1ac090fe335 (public-access) A5, §6, §6.4
- Related: ADR-20261116 (visibility = server-side Strategy), 20261116-public-class-gateway, 20261116-public-gateway-dlp-scrubtree

## Context

`/courses` and `/project-openings` are authed-only today (`AppSidebar` returns
null for anon; routes behind `ProtectedRoute`). Public-access opens them to anon
with a strict §6 field set, while signed-in members keep the fuller view — project
`phase`/`requires_interview`, cohort `status`/`capacity`/`timezone`, client
`status`/`kind`, application counts — and the apply/register actions. mdenner's
decision: **auth-aware gateway** — one endpoint, two shapes by auth state (not
split data paths, not strict-for-everyone).

Field selects were also hardcoded per gateway, so "what is public" had no single
source of truth for the A7 CI guard to check.

## Decision

1. **One policy module, `supabase/functions/_shared/public-visibility.ts`**, is the
   server-side source of truth. Per resource (class, cohort, project, client) it
   defines the **anon** field set (strict §6) and the **authed-only extras**;
   `fieldsFor(resource, authState)` returns the PostgREST select for that state.
   Secrets/PII/enrolled-only data (`client.primary_contact`, `cohort.meeting_url`,
   lesson bodies) are in **neither** set — they need their own authed/entitled
   paths, never this public gateway.
2. **Gateways resolve auth state and select accordingly.** `resolveAuthState(req)`
   reads an optional bearer token and **fails safe**: it widens to `authenticated`
   ONLY for a cryptographically valid, unexpired Supabase session
   (`authStateFromUserResult`); a missing/malformed/expired/unverifiable token →
   `anon`. A forged token can never unlock the authed set. Computed authed-only
   signals (e.g. `applicationCount`) are gated on the same state. `public-project-detail`
   is wired this way; the other gateways follow the same pattern.
3. **Presentation reflects, never decides** (ADR-20261116). The client policy
   `src/lib/visibility/public-nav-policy.ts` is the single source for which nav
   routes anon may see (`/courses`, `/project-openings`, their detail subpaths, home)
   and which actions are always authed (`apply`/`register`/`enroll`/`mark-complete`
   → anon is redirected to login, never allowed). The sidebar/pages consume it
   (`filterNavForAuth`) instead of scattering `if (user)` checks. Real enforcement
   stays server-side (the gateway returns less to anon; A6 REVOKE backs it).

## Consequences

- **Good:** one audited source of truth for public fields (what A7's CI guard
  checks); fail-safe auth widening; no scattered visibility logic.
- **Trade-off:** a dynamic (non-literal) `.select()` loses supabase-js's row typing
  (returns `GenericStringError`), so the gateways cast the row to the shape they
  read. The response still contains only the selected columns.
- **Runtime split:** the field policy (Deno) and the nav policy (frontend) are two
  co-located modules, not one shared import — the runtimes can't share a module.
  Both implement the same §6 Strategy and are documented as such.
- **No prod regression:** the auth-aware gateway defaults anon→strict, so a page
  that doesn't yet send the user's bearer gets the strict set. The frontend wiring
  to send the bearer (so authed pages keep the full set) lands in Phase B; nothing
  deploys until then, so the interim never reaches prod.

## Verification

- `supabase/functions/_shared/public-visibility.test.ts` (Deno, 6 cases): anon
  excludes the authed extras; primary_contact/meeting_url in neither; fail-safe
  auth resolution (only a verified user widens). `src/test/lib/public-nav-policy.test.ts`
  (4 cases): public route set, action gating, auth filtering. `deno check` + `tsc`
  clean.

## Remaining (A5 follow-on)

`public-project-openings` and `public-class-detail` consume the policy the same way
(class-detail also drops its duplicate select constants in favor of the shared
module; cohort mapping becomes auth-aware). Frontend consumption (sidebar
`filterNavForAuth`, pages sending the bearer + action redirects) is Phase B (B8).
