# ADR 0049 — Session timeout is idle-only with one owner and a bounded backstop

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `src/lib/session-timeout-policy.ts` (the single owner this creates), `src/lib/security.ts` (`getSessionPolicyFailureReason` — the pure mechanism), `src/features/auth/services/session.service.ts` (silent backstop enforcement), `src/components/IdleTimeoutGuard.tsx` + `src/hooks/use-idle-timeout.ts` (the warned in-session timer), `src/lib/session-activity.ts` (cross-tab activity tracker), `scripts/ci/check-session-timeout-single-owner.mjs` (the mechanical guard), `06-auth-flow-lockdown.skill.md` (frozen-auth protocol this change followed). Skills: `owasp-secure-coding-bdd`, `sre-operational-readiness`.

## Context and problem statement

A member reported being **signed out mid-work** on 2026-09-18. Investigation found the client session-timeout was already _meant_ to be idle-based (activity resets a 60-minute clock), but its implementation was structurally fragile in four ways that let a logout feel arbitrary and could drift again:

1. **Two enforcers, one silent.** `IdleTimeoutGuard` runs an in-session timer and shows a 2-minute warning; `sessionService.getSession()` independently re-checks an idle policy at every route change / query refetch and signs out **with no warning**. A user whose recorded activity looked stale (most commonly: the TFN tab sitting in the background while they worked elsewhere for >60 min) was ejected silently.
2. **The timeout was copied in three places** kept in sync by hand: `timeoutMinutes = 60` in the guard, `IDLE_SESSION_AGE_MS` / `MAX_SESSION_AGE_MS` in `session.service`, and a **dead** `auth-session.service.ts` still declaring 30 min / 4 h. Two clocks disagree eventually (this was a High finding in the 2026-08 audit).
3. **A silent short-default trap.** `getSessionPolicyFailureReason` defaulted to `idle = 20 min, absolute = 4 h`. The one caller overrode both, but any future caller that forgot would silently reintroduce a 20-minute idle and a 4-hour hard cutoff.
4. **The absolute cap was `Number.POSITIVE_INFINITY`** (unbounded session — an OWASP session-management smell), and the only "test" was an auto-generated placeholder asserting `App.tsx` exists.

**Out of scope, stated honestly:** the _authoritative_ caps (GoTrue JWT expiry, session time-box, inactivity timeout) live in the **Supabase dashboard**, not this repo. A dashboard time-box is the most likely cause of a hard 60-minute cutoff of an _active_ user, because the client caps are idle-based and reset on activity. The owner chose (2026-09-18) to defer the Management-API gate that would assert those dashboard values in CI; this ADR hardens the client and leaves that dashboard layer as a documented, owner-owned manual setting.

## Decision drivers

- **The user's requirement:** sign out only after 60 minutes of _no activity_; never interrupt active work.
- **One owner for one fact** (data ownership): a single constant, imported everywhere, so copies cannot drift.
- **Bounded, not unbounded** (OWASP): keep a backstop, but set it far above any real work session so it never interrupts active use.
- **No silent short default:** a caller must not be able to inherit a short window by omission.
- **CI-enforced, fail-closed:** the invariant is worth nothing if the next change can quietly break it.
- **Respect the auth freeze:** one concern, full auth regression suite, both architecture-gate halves, owner merge.

## Considered options

1. **Tweak the constant / bump the dashboard number (status quo).** Rejected: non-structural. The copies still drift, the silent path still surprises, and the dashboard is still unversioned.
2. **Pure idle, absolute = `Infinity`.** Matches the literal request but leaves a session that can live forever with periodic activity — an OWASP smell, and it keeps the unbounded absolute the audit flagged. Rejected.
3. **One owner + 7-day absolute backstop + required policy bounds + a mechanical guard + real tests (chosen).**
4. **Also add a Supabase-dashboard config gate** (Management API asserts time-box / inactivity / JWT expiry). Deferred by the owner; documented here as the remaining layer that would make the _dashboard_ un-driftable too.

## Decision outcome

**Chosen: Option 3.**

- **`src/lib/session-timeout-policy.ts`** is the single source of truth: `SESSION_IDLE_TIMEOUT_MS = 60 min`, `SESSION_IDLE_WARNING_MS = 2 min`, `SESSION_ABSOLUTE_TIMEOUT_MS = 7 days`. `IdleTimeoutGuard`, `use-idle-timeout`, and `session.service` all import from it — no local copies remain.
- **The absolute cap becomes a bounded 7-day backstop** (was `Infinity`). It sits far above any work session, so it never interrupts active use; it only bounds a session left open / a hijacked refresh token.
- **`getSessionPolicyFailureReason` / `isSessionWithinPolicy` now require explicit `idleTimeoutMs` and `absoluteTimeoutMs`** (the 20 min / 4 h defaults are gone). `security.ts` owns only the _mechanism_; the _values_ live in the policy module; `session.service` composes them. A caller can no longer silently get a short window — it is a compile error to omit the bounds.
- **The dead `auth-session.service.ts` is deleted**, closing the audit's "two clocks" finding.
- **`useIdleTimeout` exposes no timeout override** — it always uses the owner constants, so no consumer can pass a divergent literal and reintroduce two-clock drift; the idle window has exactly one source.
- **A mechanical guard, `scripts/ci/check-session-timeout-single-owner.mjs`** (self-declared `// ci-lane: critical`, run in the required `lint-arch-critical` guard matrix per ADR-0047), fails CI if a legacy clock constant (`IDLE_SESSION_AGE_MS`/`MAX_SESSION_AGE_MS`/`IDLE_TIMEOUT_MS`) is declared anywhere, or an owner constant is copied outside the owner. It is fail-closed and pinned by a discriminating smoke test. It deliberately does **not** ban raw time literals by value (the tree has many legitimate `* 60 * 1000` uses).
- **Real tests replace the placeholder:** the hook resets on activity and only fires after a full idle window (`use-idle-timeout.test.ts`); the policy values are pinned (`session-timeout-policy.test.ts`); and the `getSession` backstop keeps an active user in yet enforces the 7-day cap (`session-idle-not-absolute-2026-09-18.test.ts` — this last one fails on the pre-change `Infinity`).

## Consequences

**Good**

- An actively-working user is never signed out by client logic: activity (mouse/keyboard/scroll/touch/focus/visibility, playing media, focused iframe) resets one shared 60-minute clock.
- The timeout can no longer drift: one owner, CI-guarded, value-pinned. The silent short-default trap and the unbounded session are both gone.
- The "two clocks" audit finding is resolved.

**Trade-offs**

- The `getSession` backstop remains **silent** (no warning) by nature — it runs on reload/return when the in-session timer isn't mounted. It now shares the exact idle window with the warned guard, so for a foreground user the warned path fires first; the silent path only ends a genuinely-idle or >7-day session.
- The 7-day backstop will sign out a continuously-open session once at 7 days. Accepted by the owner as the security/usability balance.

**Honest limits (what this does NOT guarantee)**

- If the browser cannot reach Supabase to refresh the access token (network drop, sleep, GoTrue outage), the session can still end regardless of activity — a third-party dependency, not client-fixable.
- If local/session storage is wiped mid-session (privacy tooling, ITP partitioning), activity/marker state is lost and the user may be treated as new/idle.
- The absolute backstop is measured from the per-tab session marker (`sessionStorage`), so it effectively resets when a tab is closed/reopened — a _soft_ cap. The authoritative absolute cap is the Supabase **time-box** (dashboard), intentionally not gated here (Option 4, deferred).
- "No activity in the browser at all" cannot include other apps or other origins' tabs — a web page only observes its own origin's events.
- The mechanical guard enforces constant-name ownership, not "no hardcoded duration anywhere." A brand-new idle timer built from raw literals under a novel name would pass the guard; catching that relies on `judge-arch` / code review. (The primary injection path — passing a custom window into `useIdleTimeout` — is closed structurally: the hook takes no override.)
