---
name: Login rate limit fairness
description: Login rate limiter peeks pre-auth and only increments on confirmed credential rejections; UI offers a device-lockout reset link
type: feature
---

# Login rate limit fairness (LCL-RL-001..003)

## Problem
Users reported "too many attempts" after a single retry. Root cause: the
client called `check_rate_limit` (increments) before authenticating, so
every attempt — successful OR failed — consumed a slot in the 6/15min
bucket. Combined with the client-side `sessionStorage` progressive lockout
(`tfn:auth-progressive-lockout`), prior successful logins or stale state
could pre-block the very first visible retry.

## Fix
1. **Two new RPCs** in public schema (security definer, search_path locked):
   - `peek_rate_limit(identifier, action, ...)` — read-only check, no increment.
   - `record_rate_limit_failure(identifier, action, ...)` — increments via
     existing `check_rate_limit` body; semantics unchanged.
2. **`RateLimitService`** exposes `peek()` and `recordFailure()`. Legacy
   `check()` retained for non-login flows but should be replaced over time.
3. **`LoginPage`** uses `peek()` pre-auth. Server-side `recordFailure()` is
   only invoked inside the credential-reject branch (alongside the
   client-side `recordInvalidAuthAttempt()` for the device lockout).
4. **Recovery UI**: when locked, the auth banner shows a
   "Clear this device's lockout" inline link that calls `clearAuthLockout()`
   so users blocked by stale sessionStorage state can recover without
   restarting the browser.

## Buckets
- Login: 6 attempts / 15 min, 60 min block (server). Device: 5 / 10 min, escalating up to 5 min (client).
- Successful logins also clear both via `clearAuthLockout()` + `clearLoginCaptcha()`.

## BDD
- LCL-RL-001 — Successful logins do not consume the failure bucket
- LCL-RL-002 — Confirmed bad password increments the server bucket once
- LCL-RL-003 — Locked-out user can clear device lockout
