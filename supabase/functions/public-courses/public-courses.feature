# Public-access A8: the free Core-course OUTLINE for logged-out visitors.
#
# Audiences (established with the owner, 2026-11-16 / 2026-11-18):
#   - anonymous    : a logged-out visitor hitting the public courses surface
#   - authenticated: a signed-in learner (sees the SAME outline; it is auth-invariant)
#
# System A (course_catalog/lesson_catalog) is FREE and separate from the paid
# classes/cohorts system — no price, no cohort, no Gumroad, no registration (see
# ADR 20261118-public-domain-bounded-contexts). This gateway serves STRUCTURE
# ONLY; lesson copy lives client-side, keyed by these slugs.
#
# The @security scenarios below are proven NOW by executable tests:
#   - the §6 allowlist contract is enforced by the A7 guard self-test
#     (src/test/ci/check-public-field-allowlist.test.ts) + the frozen feed contract
#     (supabase/functions/_shared/public-feed-contract.test.ts);
#   - the anon table lockdown by pgTAP
#     (supabase/tests/revoke_anon_course_lesson_catalog_test.sql).
# The @status:planned behavioral scenarios get their DB row + e2e spec in Phase B,
# when the public courses page exists (the repo's ratchet: a scenario is registered
# `implemented` only once a real test backs it).

Feature: Public courses outline gateway (A8, System A)

  The public-courses edge function is the single server-side path that shows the
  free Core-course outline to a logged-out visitor. It runs under the service role
  (anon has no table grants), serves only the §6 course/lesson allowlist, hardens
  with WAF + output DLP, and never leaks lesson bodies or non-core courses.

  # ---- Anonymous visitor: the public payload contract (@security) -----------

  @audience:anonymous @usecase:public-course-allowlist @category:permission @quality:security @severity:critical
  Scenario: The public course payload exposes only the allowlisted outline columns
    Given the active Core courses exist in course_catalog with their lesson_catalog rows
    When an anonymous visitor fetches the courses via the public-courses gateway
    Then each course exposes only course_key, display_label, display_order, phase and tier
    And each lesson exposes only lesson_id, course_key, display_order and required
    And no lesson body, title, video or created_at timestamp is returned

  @audience:anonymous @usecase:public-course-core-only @category:boundary @quality:security @severity:high
  Scenario: Only free, active, core-tier courses are returned
    Given active core courses and the onboarding-tier courses (onboarding, connect-discord) and an inactive core course
    When an anonymous visitor fetches the courses via the gateway
    Then only the active core-tier courses are returned
    And no onboarding-tier course and no inactive course is returned

  @audience:anonymous @usecase:public-course-lockdown @category:permission @quality:security @severity:critical
  Scenario: Anon cannot read the catalog tables directly, only through the gateway
    Given the A8 REVOKE has been applied
    When the anon role attempts a direct PostgREST read of course_catalog or lesson_catalog
    Then it has no table privilege and reads no rows
    And the service-role gateway remains the only anon read path

  @audience:anonymous @usecase:public-course-dlp @category:adverse @quality:security @severity:high @status:planned
  Scenario: A stray secret in an admin-authored label is scrubbed
    Given a core course whose display_label contains an email address
    When an anonymous visitor fetches the courses via the gateway
    Then the email address is redacted in the response

  @audience:anonymous @usecase:public-course-error @category:error @quality:reliability @severity:high @status:planned
  Scenario: A downstream failure returns a generic error, not internals
    Given the database is returning errors
    When an anonymous visitor fetches the courses via the gateway
    Then the gateway responds 500 with a generic message
    And no stack trace, SQL or internal identifier is returned

  @audience:anonymous @usecase:public-course-method @category:negative @quality:security @severity:medium @status:planned
  Scenario: A non-GET request is rejected
    Given an anonymous caller
    When they POST to the public-courses gateway
    Then the gateway responds 405 and performs no database query

  @audience:anonymous @usecase:public-course-empty @category:empty-overflow @quality:functional @severity:medium @status:planned
  Scenario: No active core courses still returns a well-formed empty list
    Given there are no active core-tier courses
    When an anonymous visitor fetches the courses via the gateway
    Then the response is a 200 with count 0 and an empty courses list

  # ---- Signed-in learner: parity (@functional) ------------------------------

  @audience:authenticated @usecase:public-course-parity @category:happy @quality:functional @severity:high @status:planned
  Scenario: A signed-in learner sees the same outline as an anonymous visitor
    Given a signed-in learner
    When they fetch the courses via the public-courses gateway
    Then the course and lesson outline is identical to the anonymous payload
