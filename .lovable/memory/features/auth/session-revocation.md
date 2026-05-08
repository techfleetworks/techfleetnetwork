---
name: Session Revocation
description: Revoked_sessions row is source of truth; GoTrue signOut is best-effort; password reset keeps current device signed in
type: feature
---
The `public.revoked_sessions` table is the source of truth for cross-device sign-out. Other devices self-evict on next `getSession()` via `is_session_revoked()`. The `auth.admin.signOut(userId, "global")` call is best-effort and MUST NEVER block the user — GoTrue commonly returns errors when no other sessions exist or for recently recreated users.

**Edge function `sign-out-all-devices`** accepts `{ reason, keep_current }`. Inserts the revoked_sessions row first (500 only if that fails). Then optionally calls GoTrue admin.signOut and treats errors as warnings. Always returns 200 with `{ success, revocation_recorded, gotrue_signed_out, keep_current, reason }`.

**Password reset** uses `keep_current: true` so the user stays signed in on the device they just used. The fresh JWT issued AFTER the revocation row passes `is_session_revoked`; older tokens on other devices fail it.

**AuthService.signOutAllDevices(opts)** returns `{ revocationRecorded, gotrueSignedOut }` and never throws. AuthService.updatePassword wraps the revoke in try/catch — a revoke failure can never mask a successful password change.

BDD: AUTH-REVOKE-010..013.
