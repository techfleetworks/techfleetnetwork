# @pending — committed spec; step defs not yet wired (needs Deno + Supabase auth). Behaviour is
# already proven by src/test/smoke + the session-revocation guard; this is the BDD execution layer.
# See ADR 20261110.
@pending
Feature: Session revocation is enforced on the SERVER, for every authenticated edge call
  Revoking a session (self "sign out all devices", admin revoke, emergency global
  sign-out) writes the revocation fact to public.revoked_sessions, read by the DB
  function public.is_session_revoked(user, issued_at). Before this change the only
  reader was the browser (src/features/auth/services/session.service.ts), so a stolen
  access/refresh token used directly against the API — outside our SPA — never saw the
  check and kept working (re-audit 2026-10-30 SEC-1 / RH1; OWASP Session Management:
  server-side invalidation). requireAuthenticatedRequest in
  supabase/functions/_shared/request-auth.ts now reads that same owner on every
  authenticated edge call, so the check runs where the attacker actually is.

  Executable proof:
    - supabase/functions/_shared/request-auth.test.ts (issuedAtIsoFromClaims: the
      revocation check keys off the token's own `iat`, and a token with no usable `iat`
      is unverifiable → the caller fails closed).
    - scripts/ci/check-session-revocation-enforced.mjs + its smoke test
      src/test/smoke/check-session-revocation-enforced.smoke.test.ts (the server-side
      is_session_revoked check cannot be removed, and raw admin.signOut( cannot be
      reintroduced as the mechanism).

  @security
  Scenario: A stolen access token is rejected at the edge after the session is revoked
    Given a user's session has been revoked (a revoked_sessions row covers the token's issued-at)
    And an attacker holds that user's still-unexpired access token
    When the attacker calls an authenticated edge function directly, not through the SPA
    Then requireAuthenticatedRequest calls is_session_revoked for the token's user and issued-at
    And the revoked session is detected on the server
    And the request is rejected with 401 Unauthorized before any handler logic runs

  @security
  Scenario: A token whose revocation status cannot be determined is not honored (fail closed)
    Given a valid access token
    When the is_session_revoked check cannot be completed (the RPC errors, or the token carries no numeric iat)
    Then the request is not allowed to proceed as authenticated
    And an RPC error is reported and answered with 503 (retryable, not a credential verdict that forces sign-out)
    And a missing issued-at is answered with 401 Unauthorized

  @security
  Scenario: Raw GoTrue admin.signOut is not treated as the revocation mechanism
    Given revocation must survive a stolen token used outside the SPA
    When an edge function tries to revoke a session
    Then it writes the revoked_sessions row through the revocation owner, read server-side on every edge call
    And it does not rely on admin.auth.admin.signOut(userId, ...) alone (a user id is not a JWT; the error is swallowed)
