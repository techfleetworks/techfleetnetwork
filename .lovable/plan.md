## Why this happens

`AuthService.updatePassword` → `signOutAllDevices` → invokes `sign-out-all-devices` edge fn → calls `supabase.auth.admin.signOut(userId, "global")` and returns **HTTP 500** on any GoTrue error. It also never inserts into `public.revoked_sessions`, so the server-side `is_session_revoked` gate (the real cross-device defense) is never armed by this path.

For users recreated after the recent purge, GoTrue often has no other active sessions / a transient lookup error → 500 → client throws `"Failed to revoke all sessions. Please try again."` even though the password change succeeded. The user is also force-signed-out of the device they just used.

## Fix — three layers, UX-first

### Layer 1 — Edge function (`supabase/functions/sign-out-all-devices/index.ts`, full rewrite)

- POST body (all optional): `{ reason?: "self_password_changed"|"self_requested"|"admin_revoked"|"security_concern", keep_current?: boolean }`.
- Step A (SOURCE OF TRUTH): insert one row into `public.revoked_sessions` with `user_id`, `reason`, `revoked_by = user_id`. If this insert fails → return 500 (genuine failure).
- Step B (BEST-EFFORT): if `keep_current !== true`, call `auth.admin.signOut(userId, "global")`. **Any GoTrue error is logged + warned but NEVER fails the request.** This is the bug fix.
- Always return `200 { success: true, revocation_recorded: true, gotrue_signed_out: bool, keep_current: bool, reason }` (when authenticated).
- Uses shared `requireAuthenticatedRequest`, `getAdminClient`, `createEdgeLogger` (matches `revoke-user-sessions` / `admin-sign-out-all-users` style; no manual JWT plumbing).
- Idempotent — repeat calls just append revocation rows; trigger writes one audit row per call.

### Layer 2 — Client (`src/services/auth.service.ts`)

- `signOutAllDevices(opts?: { keepCurrent?: boolean; reason?: string })`:
  - Invokes edge fn with `{ reason, keep_current }`.
  - If edge call errors: log, fire `account_activity` warning, **do not throw**. Local sign-out still happens unless `keepCurrent`.
  - If `keepCurrent !== true`: also `await supabase.auth.signOut()` and clear `SESSION_STARTED_AT_KEY`.
  - If `keepCurrent === true`: leave the current session intact (no `signOut`, no key clear).
- `updatePassword(newPassword)`:
  - After `updateUser({ password })` succeeds, call `this.signOutAllDevices({ keepCurrent: true, reason: "self_password_changed" })`.
  - Wrap in try/catch — a revoke failure can NEVER mask a successful password change.
  - Returns `{ otherDevicesRevoked: bool }` so the UI can choose its toast.

### Layer 3 — Reset-password page (`src/pages/ResetPasswordPage.tsx`)

- Remove `await supabase.auth.signOut({ scope: "local" })` after `updatePassword` (the user stays signed in on this device).
- Remove the 3-second redirect-to-login.
- New success card: green check + "Password updated. You're signed in on this device. Other devices will be signed out within a minute." + primary button "Go to dashboard" → `navigate("/dashboard", { replace: true })`. Secondary subtle link "Sign out other devices manually" only shown when `otherDevicesRevoked === false` — clicking it retries the revoke in the background and shows a quiet blue info toast.
- Auto-redirect to `/dashboard` after 2 s if user doesn't click (matches the 100dvh layout rules; no flash of login screen).
- Microcopy + button respect WCAG 2.0/3.0 AA contrast and existing `card-elevated` styles.

### Audit + observability

- Existing `audit_session_revocation` trigger already writes `event_type = 'session_revoked'` per inserted row — no new trigger needed.
- Edge fn logs structured JSON: `revoke` action with `requestId`, `userId`, `reason`, `keepCurrent`, `gotruSignedOut` for the Triage tab.
- No new fingerprints; existing error-triage queue picks up any 500s.

### BDD scenarios (insert via insert tool into `bdd_scenarios`)

- **AUTH-REVOKE-010** Self password reset succeeds + revocation row written even when GoTrue has no other active sessions. [UI] success card "You're signed in on this device", no red toast. [DB] one new `revoked_sessions` row with `reason='self_password_changed'`, `revoked_by = user_id`. [Code] edge fn returns 200 with `gotrue_signed_out:false`, `revocation_recorded:true`, `keep_current:true`.
- **AUTH-REVOKE-011** Stale tokens on other devices are evicted on next `getSession()` because `is_session_revoked` returns true. [UI] other device shows login screen on next nav. [DB] `is_session_revoked(user_id, old_issued_at)` = true. [Code] `AuthService.getSession` returns null and calls `supabase.auth.signOut()`.
- **AUTH-REVOKE-012** Idempotent: two consecutive calls produce two rows, never an error. [UI] no error toast. [DB] +2 rows in `revoked_sessions`. [Code] both responses 200 success.
- **AUTH-REVOKE-013** Recreated-after-purge user completes password reset → lands on dashboard, no `"Failed to revoke all sessions"` error. [UI] success card → dashboard. [DB] revocation row inserted, audit_log gets `session_revoked` and `password_updated`. [Code] no client-side throw, `updatePassword` resolves with `otherDevicesRevoked:true`.

### Memory

- New: `mem://features/auth/session-revocation` — "Revocation row in `public.revoked_sessions` is the source of truth; GoTrue `admin.signOut` is best-effort and must never block the user. Password reset uses `keep_current:true` so the user stays signed in on the device they just used."
- Update `mem://features/auth-flow/password-reset` — note the new keep-current-device behavior.

## Files

| Action | Path |
|---|---|
| Rewrite | `supabase/functions/sign-out-all-devices/index.ts` |
| Edit | `src/services/auth.service.ts` (`signOutAllDevices`, `updatePassword`) |
| Edit | `src/pages/ResetPasswordPage.tsx` (success state + no local signOut) |
| Insert (data) | 4 rows in `bdd_scenarios` via insert tool |
| New | `.lovable/memory/features/auth/session-revocation.md` |
| Edit | `.lovable/memory/features/auth-flow/password-reset.md` |
| Edit | `.lovable/memory/index.md` (add memory reference) |

## Out of scope

- No changes to `revoke-user-sessions` or `admin-sign-out-all-users` (already correct).
- No changes to audit hash chain, retention, or RLS.
- No DB migration — schema unchanged.
