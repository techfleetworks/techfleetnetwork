# Fix: signups & logins blocked by our own captcha interceptor

## What's happening

Reproduced from the audit log — every recent failed signup over the last week returns `code: 403` with **"Complete the human verification before trying again."** That string does not come from Supabase. It comes from our own fetch interceptor in `src/lib/client-request-throttle.ts` (line 144, `captchaRequiredResponse`), which short-circuits any auth POST when:

- `isLoginCaptchaRequired()` is true (it always returns `true`), AND
- `hasFreshLoginCaptchaVerification()` is false.

The "fresh verification" marker is only set by `markLoginCaptchaVerified()`, which is only called by `verifyTurnstileToken()` in `src/lib/turnstile-verification.ts`. **Nothing in the live app calls `verifyTurnstileToken`** — Register/Login/Forgot-Password pass the Turnstile token directly into `supabase.auth.signUp/signInWithPassword/...` via the `captchaToken` option, and Supabase verifies it server-side.

Net effect: a user can complete Turnstile perfectly, see "Looks good" on every field, agree to T&Cs, click Submit — and our own interceptor blocks the request with a 403 before it ever leaves the browser. The Supabase signup endpoint is never even called, which is why the user never gets a confirmation email and System Health shows nothing in `email_send_log`.

This explains every report: not a Cloudflare bug, not a Supabase bug, not a rate-limit bug — a stale verification gate.

## Fix

Treat receipt of a non-empty Turnstile token in the widget as proof the user passed the challenge. The Turnstile token is still passed to Supabase auth, which performs the authoritative server-side verification — so the local "fresh marker" only governs whether we let our own interceptor pass the request through, not whether the user is actually a human.

### Changes

1. **`src/components/auth/TurnstileChallenge.tsx`** — in the Turnstile `callback` (line 98), call `markLoginCaptchaVerified()` alongside the existing `onTokenChange(token)`. This sets the fresh-verification marker the moment Cloudflare returns a token, so the fetch interceptor stops blocking the auth POST.

2. **`src/components/auth/TurnstileChallenge.tsx`** — in `expired-callback` and `error-callback`, leave the verified marker alone (Supabase will reject a stale/missing token anyway, and clearing it would re-introduce the same blank-state lockout we just fixed).

3. **`src/lib/auth-captcha.ts`** — keep `markLoginCaptchaVerified` as the single source of truth for the fresh marker; no API changes.

4. **No change to the interceptor itself.** The defense-in-depth gate remains for any auth POST that does not flow through our forms (e.g., direct fetch from devtools).

### Tests / BDD

- Add BDD scenario `LCL-CAP-010` "Signup with valid Turnstile token completes": Given a user fills the register form and Turnstile returns a token, when they submit, then [UI] they see the "Check your email" confirmation, [DB] a row is inserted into `auth.users`, [Code] the fetch interceptor does NOT return 403 and the Supabase `/signup` endpoint is called with the captcha token.
- Add BDD scenario `LCL-CAP-011` "Login with valid Turnstile token completes": same shape for the `/token` endpoint.
- Add unit test in `src/test/components/TurnstileChallenge.test.tsx` (create if absent) verifying the callback path calls `markLoginCaptchaVerified`.

### Operational cleanup

- Run a one-time `UPDATE` to mark the existing `email_signup_confirmation_pipeline_unhealthy` audit_log entries as resolved-by-fix so the System Health alarm clears once the next probe runs.
- Add note to `mem://features/auth-flow` documenting that TurnstileChallenge owns the fresh-verification marker.

## Out of scope

- No change to Cloudflare site keys, Supabase captcha config, or the interceptor's overall posture.
- No UX change visible to users — they fill the same form, see no extra step, but submission now actually goes through.
