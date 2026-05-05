---
name: Account Deletion (Orphan-Free)
description: auth.users is the single delete entrypoint; bidirectional triggers + nightly reconciliation prevent ghost accounts that block re-signup
type: feature
---

# Account Deletion — Orphan Prevention

## Single source of truth
**`auth.users` is the ONLY entrypoint for account deletion.** App code (edge functions, services) MUST NOT delete `profiles` or any user_id-keyed child table directly as a step toward "deleting an account". Doing so creates a partial-purge window where the profile is gone but the auth row survives, producing a "ghost" account that silently blocks re-signup with the same email (Supabase Auth no-ops the signup and never sends a confirmation email).

## Database-enforced invariants

1. **`on_auth_user_deleted`** (BEFORE DELETE on `auth.users`) — cascades to every public.* table referencing that user_id inside one transaction. `audit_log` is intentionally retained for SOC 2.
2. **`trg_cascade_delete_auth_on_profile`** (AFTER DELETE on `public.profiles`) — if a profile is deleted directly, the matching auth.users row is also deleted. Belt-and-suspenders against legacy code paths.
3. **`trg_enforce_profile_has_auth_user`** (BEFORE INSERT on `public.profiles`) — raises foreign_key_violation if `user_id` does not exist in `auth.users`. Closes the other direction.
4. **`reconcile_account_orphans()`** — pg_cron job `reconcile-account-orphans-nightly` runs at 03:10 UTC, removes any drifted orphans on either side, writes `event_type=orphan_reconciliation` to `audit_log`.

## Edge function rules
- `delete-account` (self-serve): single `auth.admin.deleteUser(userId)` call. No manual child deletes.
- `admin-purge-auth-user`: single `auth.admin.deleteUser(target.id)` call for the user_id cascade. Still handles **email-keyed** cleanup (`suppressed_emails`, `failed_login_attempts`, `email_unsubscribe_tokens`, `rate_limits`) since those are not tied to a user_id and the trigger cannot reach them. Keeps admin + 2FA gate, last-admin guard, audit log.

## UX
Double-confirmation flow on the user-facing "Delete my account" screen is unchanged.

## BDD
ACC-DEL-020 (self-serve), ACC-DEL-021 (admin purge), ACC-DEL-022 (insert guard), ACC-DEL-023 (nightly reconciliation). All in `bdd_scenarios` table.

## Anti-enumeration silent-duplicate handling
Supabase Auth does NOT return an error when an email is already registered. It returns a "success" with `data.user.identities = []` and `data.session = null`, and sends NO email. `AuthService.signUp` MUST detect this shape and throw `Error("ACCOUNT_EXISTS")` with `err.code = "ACCOUNT_EXISTS"`. RegisterPage MUST branch on `err.code === "ACCOUNT_EXISTS"` and render the "You already have an account" info card (Sign-in / Reset-password / Use different email CTAs) — NOT the generic red error banner, NOT the "check your email" success screen. This branch must NOT consume rate-limit slots or bump the device-lockout counter (it is not a failed attempt).
