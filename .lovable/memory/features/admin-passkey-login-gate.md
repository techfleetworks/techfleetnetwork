---
name: admin-passkey-login-gate
description: Admins verify passkey once per device; trust persists 30 days, not bound to JWT refresh.
type: feature
---

Admins must verify their passkey to access the app. Verification is bound to a
stable per-device id stored in `localStorage` (`tfn.device_id.v1`), NOT to the
rotating JWT access token. This means:

- One passkey prompt per new device or after 30 days of inactivity
- JWT refreshes (~10 min) do NOT trigger re-prompts
- Clearing site data or signing out from a different device → next visit re-prompts (safe default)
- Recovery via emailed one-time link also marks the current device verified for 30 days

Implementation:
- `src/lib/device-id.ts` — generates/persists the per-device id and computes
  `sha256(v1:{userId}:{deviceId})` as the verification hash
- `passkey_login_sessions.session_token_hash` stores the device hash (column
  name kept for backwards compat); `expires_at` is 30 days from verification
- Edge functions `passkey-auth-verify` and `passkey-recovery-verify` accept
  `device_id` in the request body and validate length (16–256 chars)
- `is_passkey_login_verified(_session_hash)` RPC unchanged — it just checks
  the hash + expiry, which now represents a device, not a JWT
