---
name: Login rate limit fairness
description: Server-side peek/record split + silent device-lockout auto-heal so legitimate users never see "too many attempts" or technical recovery controls
type: feature
---

# Login rate limit fairness (LCL-RL-001..006)

## Problem
Users reported "too many attempts" after a single retry. Two compounding causes:
1. The client called `check_rate_limit` (which increments) BEFORE authenticating, so successful logins consumed bucket slots.
2. The device-side `sessionStorage` lockout (`tfn:auth-progressive-lockout`) persisted across page loads and could pre-block a returning user — and the only documented recovery was "open DevTools and delete the key", which is unacceptable UX.

## Fix

### Server bucket — fair counting
- New RPC `peek_rate_limit(...)` — read-only check, no increment.
- New RPC `record_rate_limit_failure(...)` — increments via the existing `check_rate_limit` body.
- `RateLimitService` exposes `peek()` and `recordFailure()`. Legacy `check()` remains for non-login flows.
- `LoginPage` peeks pre-auth; only `recordFailure()` runs in the credential-reject branch.

### Device lockout — silent self-healing (no user-visible recovery UI)
- `maybeAutoHealAuthLockout()` runs on `LoginPage` mount. If the stored lockout has ≤60s remaining or is malformed, it's deleted silently.
- `resetAuthLockoutForEmailChange()` clears the device counter when the user types a different email than the one tied to the prior failures.
- The "Clear this device's lockout" link has been **removed** — users should never see internal recovery controls. The server-side bucket (cross-device, hashed-email keyed) remains the real brute-force defense.
- A genuinely-earned recent lockout (>60s remaining) still serves out its countdown.

## Buckets
- Login server: 6 attempts / 15 min, 60 min block.
- Login device: 5 / 10 min, escalating up to 5 min — but auto-healed on mount unless freshly earned.

## BDD
- LCL-RL-001 — Successful logins do not consume the failure bucket
- LCL-RL-002 — Confirmed bad password increments the server bucket once
- LCL-RL-003 — Locked-out user can clear device lockout (superseded by auto-heal; kept for history)
- LCL-RL-004 — Stale device lockout auto-heals on page load
- LCL-RL-005 — Switching email clears the prior device counter
- LCL-RL-006 — Active lockout earned this session is preserved
