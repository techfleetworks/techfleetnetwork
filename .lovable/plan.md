## Goal

Users should never have to know what `sessionStorage` is, let alone clear a key inside it. Replace the visible "Clear this device's lockout" recovery link with silent auto-healing so the situation simply doesn't happen to legitimate users.

## Why this is safe

The device-side lockout (`tfn:auth-progressive-lockout`) only exists to slow a single attacker session that's hammering the form right now. The real brute-force defense is the **server-side bucket** (`peek_rate_limit` + `record_rate_limit_failure`, just shipped) which is keyed on the hashed email, applies across devices, and cannot be cleared by reloading. So we can be much more permissive about clearing the *device* counter without weakening security.

## Changes

### 1. `src/lib/auth-lockout.ts` — add two helpers
- `maybeAutoHealAuthLockout()` — called on LoginPage mount. If a stored lockout has 60s or less remaining (or the blob is malformed), delete it silently. A real attacker who just earned a 5-minute lockout still serves it; a returning user from yesterday gets a clean slate.
- `resetAuthLockoutForEmailChange()` — clears the device counter when the user types a different email than the one tied to the prior failures. Different account = different rate-limit context.

### 2. `src/pages/LoginPage.tsx`
- Call `maybeAutoHealAuthLockout()` once on mount, then refresh `lockoutState`.
- Track the email associated with the last failed attempt; when the email field changes to a different value, call `resetAuthLockoutForEmailChange()` and refresh state.
- **Remove** the visible "Clear this device's lockout" link from the auth-error banner. Users never see internal recovery controls.
- If a user is genuinely locked out (just earned it), the existing countdown banner ("Try again in 0:30") still shows — that's the correct UX for someone who really did fail 5 times in a row.

### 3. BDD scenarios (added to `bdd_scenarios`)
- **LCL-RL-004** — Stale device lockout auto-heals on page load
  - Given a stored lockout with ≤60s remaining
  - When the user opens /login
  - Then [UI] no lockout banner is shown and Sign In is enabled
  - And [Code] `maybeAutoHealAuthLockout` deleted `tfn:auth-progressive-lockout`
  - And [DB] no database changes occur
- **LCL-RL-005** — Switching email clears the prior device counter
  - Given a device counter exists for `a@x.com`
  - When the user changes the email field to `b@x.com`
  - Then [UI] no inherited lockout banner appears
  - And [Code] `resetAuthLockoutForEmailChange` cleared sessionStorage
  - And [DB] no database changes occur
- **LCL-RL-006** — Active lockout earned this session is preserved
  - Given the user just failed 5 times in a row and has 4 minutes remaining
  - When the page is reloaded
  - Then [UI] the countdown banner still shows the remaining time
  - And [Code] `maybeAutoHealAuthLockout` is a no-op because remaining > 60s

### 4. Memory update
Update `mem://features/auth/login-rate-limit-fairness` to record the auto-heal behavior and the removal of the visible recovery link.

## Files touched
- `src/lib/auth-lockout.ts` (add helpers)
- `src/pages/LoginPage.tsx` (mount hook, email-change reset, remove link)
- `bdd_scenarios` rows LCL-RL-004..006
- `mem://features/auth/login-rate-limit-fairness`

No new dependencies. No DB migration needed (the prior migration already shipped the server-side rate-limit RPCs).
