---
name: admin-authenticator-2fa-login-gate
description: Passkeys are retired; admins must use Google Authenticator-compatible TOTP with a 5-day first-setup grace period.
type: feature
---

Passkey functionality is removed from the active system. Admin security uses
Google Authenticator-compatible TOTP through the built-in MFA flow.

Rules:
- Admins get a 5-day grace period for first-time 2FA setup after rollout or promotion.
- After grace expires, admin routes are blocked until TOTP is enrolled.
- Any user with verified TOTP must complete Login → 2FA → authenticated before using protected content.
- Cancelling the required 2FA prompt signs out the AAL1 session.
- Do not re-add passkey, WebAuthn registration, WebAuthn recovery, or passkey device-trust flows.

Implementation:
- `two_factor_login_sessions` stores short-lived proof for freshly verified admin operations.
- `mark_two_factor_login_verified(_session_hash)` records proof only when JWT AAL is `aal2`.
- `is_two_factor_login_verified(_session_hash)` checks active 2FA proof.
- `cleanup_two_factor_login_artifacts()` purges expired 2FA proof records.
