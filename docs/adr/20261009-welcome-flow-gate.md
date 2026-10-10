# ADR 20261009 — Mandatory Welcome-Flow gate at the ProtectedRoute seam

Status: Accepted

## Context

"Improve the Onboarding" requires a **mandatory, un-skippable Welcome Flow** shown to every
first-time login and once to each existing member (all members, all teachers, all admins — no role
is exempt). It must be enforced as a redirect in front of the ~50 authenticated routes, shown
exactly once (server-tracked, cross-device), and **must never lock anyone out** — it is the single
most lockout-sensitive surface the platform will ship this year.

Two existing facts shape the design: (1) the auth layer is **frozen** (`src/features/auth/**`,
`src/lib/auth/**`, `main.tsx` boot, the Supabase client — `06-auth-flow-lockdown`), so the gate
must live outside it; and (2) `AuthContext.fetchProfile` races a 10s timeout and can leave
`profile = null` on failure while setting `profileLoaded = true`, so "flag absent" and "read failed"
are indistinguishable from the flag alone. A two-state guard would therefore either loop a
completed user or let an un-onboarded one bypass. A legacy skippable `WelcomeWizard` (route) and a
localStorage `WelcomeDialog` already exist and must be retired.

## Decision

The gate is a **route-guard decorator composed at the `ProtectedRoute` seam** (`WelcomeGate` +
`useWelcomeGate`), not imperative `main.tsx` boot code and not a modal:

- **Three-state contract:** `!profileLoaded` → spinner; profile-read failed (`profile === null`
  after load) → recoverable **retry** state (never redirect, never bypass); known-null flag on a
  non-allowlisted route → `<Navigate to="/welcome">`; otherwise render.
- **No feature flag (product decision, 2026-10-09 — "100% launch, no flag").** The gate arms purely
  on authentication + `welcome_flow_completed_at IS NULL`; the flow is live the moment the gate PR
  merges. There is **no canary and no flag kill switch** — see Consequences for the accepted risk and
  the recovery path.
- **Sequenced after `MfaEnforcementGuard`** (security gate wins); **allowlist** `/welcome` + every
  sign-out path; the gate wins over `AuthRedirectHandler`'s `/dashboard` landing.
- **No new service, edge function, or data store** — a feature module inside the existing modular
  monolith. Completion is one `profiles` column (see ADR 20261009-welcome-flow-data-model).
- Retire the legacy `WelcomeWizard` skip + its direct `profiles` writes and the `WelcomeDialog`
  localStorage gate (contract PR after GA).

This absorbs decisions D2 (gate), D8 (flagless 100% launch), and §5.1 (no new boundary) of the
technical-requirements doc.

## Alternatives considered

- **`main.tsx` boot band-aid.** Forbidden by `CLAUDE.md` ("fix config in config; remove boot
  band-aids"); untestable and couples to the frozen layer. Rejected.
- **Two-state guard (`!flag` ⇒ redirect).** Loops a completed user or lets an un-onboarded one
  bypass on a flaked read. Rejected for the explicit three-state contract.
- **`aria-modal` dialog wrapping the app.** Dismissable, an accessibility trap (hides siblings from
  AT, implies a close affordance), and not truly un-skippable. Rejected — it is a routed `<main>`.
- **A dedicated onboarding service / orchestration edge function.** Architecture-astronautics for one
  team, one deploy pipeline, ~767 users. Rejected.

## Consequences

- One seam covers ~50 routes with no per-page `<Navigate>` drift; the gate is O(1) per navigation and
  adds zero round-trips (reads the flag from `useAuth().profile`).
- Because the gate is a **client-side redirect it is correct availability, not a security control** —
  RLS on `profiles` is the real boundary; bypassing the gate exposes nothing the user isn't already
  authorized to see. The one failure engineered against is wrongful lockout.
- All roles are gated, so the a11y/CI audit fixture (an admin replaying every route) **must** be
  welcome-complete, and a separate welcome-incomplete fixture is added.
- A no-JS / failed-bundle fallback and a Consistent-Help affordance are required so a broken bundle
  cannot present a blank un-escapable screen (WCAG, §12).
- **Rollback is a frontend revert** (promote the previous bundle / revert the commit → Cloudflare
  rebuild — on the order of **minutes**), NOT a ≤60s flag flip. **Residual risk accepted (product
  chose flagless over the recommended kill switch):** a gate defect at launch locks the whole
  userbase out until the revert ships. Mitigations that MUST hold: (a) the lockout-safety
  `@reliability` tests are a **hard merge-blocker** (loading / retry-no-trap / no-bypass all proven in
  CI before the gate PR merges); (b) the fail-safe three-state gate (unknown → retry, never trap or
  bypass); (c) the gate PR merges **only once the full flow is complete** — there is no flag to
  dark-launch a half-built flow behind; (d) a fast-revert runbook with a named launch owner on-call.
  A break-glass admin `resetWelcomeFlow` is still required (to un-complete a bad-state user).
- **Consequence / accepted downside:** the Dashboard "Welcome" completion card renders inside the
  normal user-hideable Get Started widget (P3) — a member hiding it has zero correctness impact
  because completion is server-enforced; forcing it non-hideable would fight `use-dashboard-preferences`.