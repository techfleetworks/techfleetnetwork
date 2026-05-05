---
name: Login rate limit fairness
description: Server-side peek/record split for both login and signup, separate signup_resend bucket, silent device-lockout auto-heal on both auth pages
type: feature
---

# Auth rate limit fairness (LCL-RL-001..009)

## Symptoms reported
1. "Too many attempts" after a single login retry.
2. Users could not create accounts — got blocked after a couple of submits.

## Root causes
- `check_rate_limit` was called BEFORE auth, incrementing on every call (success and failure alike).
- Signup tier was tight (3 attempts / 60-min block) and the **resend confirmation** button reused the same `signup_attempt` bucket, so two resends burned the user's signup quota.
- Device-side `sessionStorage` lockout (`tfn:auth-progressive-lockout`) persisted across loads with no auto-heal — only documented recovery was clearing DevTools.

## Fix
### Server-side
- New RPC `peek_rate_limit` (read-only) and `record_rate_limit_failure` (increments).
- New action `signup_resend` (5/15min window, 60-min block) so the resend button has its own bucket.
- One-time `DELETE` cleared all currently-active `login_attempt` / `signup_attempt` blocks so users impacted before the fix were unblocked immediately.

### Client
- `RateLimitService.peek()` and `recordFailure()` exposed; legacy `check()` kept for non-auth flows.
- `LoginPage` and `RegisterPage` both peek pre-auth and only `recordFailure()` on confirmed rejection.
- `RegisterPage` resend button uses `signup_resend`.
- Both pages call `maybeAutoHealAuthLockout()` on mount and `resetAuthLockoutForEmailChange()` when the email field is changed to a different account. The visible "Clear this device's lockout" link was removed — recovery is invisible.

## Buckets (post-fix)
- Login: 6 / 15 min, 60-min block — counted only on confirmed credential rejects.
- Signup: 3 / 15 min, 60-min block — counted only on confirmed signup failures.
- Signup resend: 5 / 15 min, 60-min block — independent.
- Password reset: unchanged.

## BDD
- LCL-RL-001..006 — login flow + device auto-heal
- LCL-RL-007 — successful signup does not consume failure bucket
- LCL-RL-008 — resend uses its own `signup_resend` bucket
- LCL-RL-009 — register page also auto-heals device lockout
- LCL-CAP-010/011 — TurnstileChallenge `callback` MUST call `markLoginCaptchaVerified()` so the client fetch interceptor (`captchaRequiredResponse`) lets the auth POST through. Supabase still verifies the token server-side via `captchaToken`. Without this call every signup/login is blocked client-side with a 403 "Complete the human verification before trying again." and the request never reaches Supabase (no email, no audit row beyond `signup_supabase_error`).
