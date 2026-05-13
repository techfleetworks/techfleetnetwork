# Triage: SECURITY DEFINER functions executable by anon/authenticated

## Findings
Only two `SECURITY DEFINER` functions in `public` are granted `EXECUTE` to `PUBLIC`:

- `public.peek_rate_limit(...)`
- `public.record_rate_limit_failure(...)`

Both linter warnings (0028 anon, 0029 authenticated) point at this same pair. Every other SECURITY DEFINER function is already locked down to `postgres` / `service_role` / sandbox roles only.

## Why these two are intentionally public
They power the Login Rate-Limit Fairness flow (memory `mem://features/auth/login-rate-limit-fairness`). They MUST be callable pre-auth by anonymous visitors so we can:
- `peek_rate_limit` — read whether the calling identity (email + device) is currently locked out before showing the password field.
- `record_rate_limit_failure` — record a failed login attempt and decide whether to lock.

They take only the caller's intended identifiers, write to a single rate-limit ledger, and return nothing sensitive. They are SECURITY DEFINER so they can write to a table `anon` cannot otherwise touch.

Removing the grant would break login lockout fairness UX. This is the intended design.

## Plan
1. Mark both linter findings (0028 + 0029) as ignored via `security--manage_security_finding`, with explanations pointing to the rate-limit fairness design.
2. Update the project security memory via `security--update_memory` so future scanners understand this is accepted risk.
3. No code or migration changes.

## Verification
- After ignoring, the security view no longer surfaces those two warnings.
- Login flow still rate-limits silently with no UX change.

## BDD
None — no behavior change.
