## Why signups for existing emails look broken today

Supabase Auth, for anti-enumeration reasons, does **not** return an error when someone signs up with an email that already exists. Instead it returns a fake "success" payload: `data.user` is populated but `data.user.identities` is an empty array and `data.session` is null. No confirmation email is sent.

Our `AuthService.signUp` treats that as success → user lands on the "Check your email" screen → never receives anything → assumes the site is broken. (This is also why "morgan@trycatalog.com" looked like nothing happened earlier — the auth row was an orphan ghost and Supabase silently no-op'd the signup.)

The orphan side is now fixed by the previous migration. The remaining piece is to **detect the silent-duplicate response and tell the user clearly**.

## Changes

### 1. `src/services/auth.service.ts` — detect existing-account response

After the retry loop, before logging success, add:

```ts
const looksLikeExistingUser =
  data?.user &&
  Array.isArray(data.user.identities) &&
  data.user.identities.length === 0 &&
  !data.session;
if (looksLikeExistingUser) {
  void logAccountActivity("signup_blocked_existing_account", { email: safeEmail });
  const err: any = new Error("ACCOUNT_EXISTS");
  err.code = "ACCOUNT_EXISTS";
  throw err;
}
```

Also keep the existing string-match branch ("already registered" / "user already") for the rare case Supabase does return an explicit error — map it to the same `ACCOUNT_EXISTS` code instead of a string so the UI can switch on it.

### 2. `src/pages/RegisterPage.tsx` — friendly UI when account exists

In the `catch` block, branch before the generic error path:

```ts
if (err?.code === "ACCOUNT_EXISTS") {
  setExistingAccountEmail(result.data.email);
  setLoading(false);
  return; // do NOT consume a rate-limit slot, do NOT show generic error
}
```

Render a dedicated card above the form (replaces the red error banner) when `existingAccountEmail` is set:

> **You already have an account**
> An account already exists for `morgan@trycatalog.com`.
>
> [Sign in instead] → `/login?email=...`
> [Reset your password] → `/forgot-password?email=...`
>
> Wrong email? [Use a different one] (clears the state)

Styling: emerald/info card, not red — this is informational, not a failure. Inline `Link` buttons use existing primary + outline button variants. Pre-fill email on the destination pages via the existing `?email=` query param both pages already accept.

Accessibility: `role="status"`, `aria-live="polite"`, focus moved to the card heading so screen readers announce it. Keyboard: both CTAs are focusable buttons.

### 3. Don't punish the user

When `ACCOUNT_EXISTS` is returned:
- Skip `RateLimitService.recordFailure` (this isn't a failed attempt).
- Skip `recordInvalidAuthAttempt()` (no device lockout bump).
- Skip `lastFailedEmailRef` update.

These currently fire in the generic catch and would cause a real user retrying the right flow to get rate-limited.

### 4. BDD scenarios

Insert into `bdd_scenarios` (feature_area `account-deletion-orphan-prevention` continuation, next IDs):
- `REG-EXIST-010` — Signup with already-registered email shows "You already have an account" card with Sign-in / Reset CTAs. [UI][DB][Code]
- `REG-EXIST-011` — Existing-account branch does NOT increment signup rate-limit bucket or device lockout counter. [DB][Code]
- `REG-EXIST-012` — "Sign in instead" CTA navigates to `/login?email=...` with email pre-filled. [UI]

### 5. Memory

Update `mem://features/account-deletion` (or add a sibling note) recording: "Supabase anti-enumeration → identities=[] + no session = duplicate. Always intercept and present 'account exists' UX, never let it reach the success screen."

## Files touched
- `src/services/auth.service.ts` — silent-duplicate detection.
- `src/pages/RegisterPage.tsx` — `ACCOUNT_EXISTS` branch + new info card.
- `bdd_scenarios` table — 3 inserts.
- `.lovable/memory/features/account-deletion.md` — append note.

## What we are NOT doing
- Not changing the LoginPage / ForgotPasswordPage — they already accept `?email=`.
- Not touching captcha, rate-limit service, or the Turnstile component.
- No backend/migration changes — purely a client-side UX fix on top of the existing auth response.
