# @auth — OUT OF SCOPE for the general BDD runner: the auth refactor owns auth features
# (sign in/up/reset/MFA/redirect). Excluded from the strict runner via `not @auth`. Also
# @pending until the auth owner wires step defs. See ADR 20261110.
@auth @pending
Feature: Post-auth redirect targets are validated (no open redirect / XSS)
  The auth register flow reads an untrusted ?redirect= query param and uses it
  for window.location.assign and for the email redirect target. Every use goes
  through src/lib/security.ts#toSafeRedirectPath. Executable proof:
  src/test/lib/security-redirect.test.ts and src/test/smoke/auth-redirect.smoke.test.ts.

  @security
  Scenario: A safe same-origin path is honored
    Given a redirect param "/projects/42?tab=tasks"
    When the post-auth redirect target is resolved
    Then it is "/projects/42?tab=tasks"

  @security
  Scenario Outline: A hostile redirect target falls back to a safe default
    Given a redirect param "<target>"
    When the post-auth redirect target is resolved
    Then it is the safe fallback, not "<target>"

    Examples:
      | target                       |
      | https://evil.example/steal   |
      | //evil.example               |
      | javascript:alert(1)          |
      | /\evil.example               |

  @security
  Scenario: The user id is never stored in the clear in web storage
    Given a signed-in user
    When the session-start marker and the OAuth-link toast dedup are written
    Then only a one-way fingerprint of the user id is persisted, never the raw id
