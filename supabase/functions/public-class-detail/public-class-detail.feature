# Public-access: logged-out class browsing (gateway + authoring guards).
#
# Audiences (established with the owner, 2026-11-16):
#   - anonymous    : a logged-out visitor hitting the public class surface
#   - admin        : an admin / class owner authoring a class (short_description, deliverables, curriculum)
#   - authenticated: a signed-in learner viewing the same single-URL class page
#
# Registration & status live in public.bdd_scenarios (migration
# 20261116140000_public_access_bdd.sql). Scenarios proven by an existing test are
# registered there as `implemented` with a real test_file; the UI/behavioral
# scenarios below (tagged @status:planned) are documented here now and get their
# DB row + e2e spec in Phase B, when the public pages exist (per the repo's
# ratchet: a scenario is registered `implemented` only once a real test backs it).

@pending
Feature: Public class detail gateway (D-A)

  The public-class-detail edge function is the single server-side gatekeeper for
  a logged-out class page. It serves only the §6 allowlist, derives the
  instructor name, hardens with WAF + output DLP, and never leaks owner or
  operational fields.

  # ---- Anonymous visitor: the public payload contract (@security) -----------

  @audience:anonymous @usecase:public-class-allowlist @category:permission @quality:security @severity:critical
  Scenario: The public class payload never contains owner_user_id
    Given a published class owned by a user
    When an anonymous visitor fetches the class via the public-class-detail gateway
    Then the response contains the instructor's display name
    And the response does not contain owner_user_id

  @audience:anonymous @usecase:public-class-allowlist @category:permission @quality:security @severity:critical
  Scenario: Hidden class columns are never exposed to anonymous callers
    Given a published class with why_take, audiences, reading_assignments and class_expectations set
    When an anonymous visitor fetches the class via the gateway
    Then the response omits why_take, audiences, reading_assignments and class_expectations
    And the response includes title, summary, description, outcomes, skills, prerequisites, short_description, deliverables and curriculum

  @audience:anonymous @usecase:public-cohort-allowlist @category:permission @quality:security @severity:critical
  Scenario: Cohorts expose only safe fields, never operational ones
    Given a published class with a published cohort
    When an anonymous visitor fetches the class via the gateway
    Then each cohort exposes only id, label, start_date, end_date and registration_url
    And no cohort exposes status, capacity, timezone or meeting_url

  @audience:anonymous @usecase:public-cohort-window @category:boundary @quality:functional @severity:high
  Scenario: Only published, not-yet-ended cohorts are returned
    Given a published class with one published future cohort and one ended cohort
    When an anonymous visitor fetches the class via the gateway
    Then only the not-yet-ended published cohort is returned

  @audience:anonymous @usecase:public-class-curriculum @category:happy @quality:security @severity:high @status:planned
  Scenario: Anonymous visitor sees the curriculum field but no lesson bodies
    Given a published class whose curriculum field is set and whose modules have lesson items
    When an anonymous visitor fetches the class via the gateway
    Then the sanitized curriculum HTML is returned
    And no class_module_items lesson row, body or video is returned

  @audience:anonymous @usecase:public-class-not-found @category:negative @quality:security @severity:high @status:planned
  Scenario: An unpublished or unknown class slug returns not-found
    Given a class slug that is draft, archived or does not exist
    When an anonymous visitor fetches it via the gateway
    Then the gateway responds 404 with no class data

  @audience:anonymous @usecase:public-class-bad-slug @category:boundary @quality:security @severity:medium @status:planned
  Scenario: A malformed slug is rejected before any lookup
    Given a slug containing characters outside lowercase kebab-case
    When an anonymous visitor calls the gateway with it
    Then the gateway responds 400 and performs no database query

  @audience:anonymous @usecase:public-class-dlp @category:adverse @quality:security @severity:high @status:planned
  Scenario: Free-text leaks are scrubbed while URLs survive
    Given a published class whose description contains an email address
    And whose hero_image_url contains a long hex storage path
    When an anonymous visitor fetches the class via the gateway
    Then the email address is redacted in the description
    And the hero_image_url is returned intact

  @audience:anonymous @usecase:public-class-error @category:error @quality:reliability @severity:high @status:planned
  Scenario: A downstream failure returns a generic error, not internals
    Given the database is returning errors
    When an anonymous visitor fetches a class via the gateway
    Then the gateway responds 500 with a generic message
    And no stack trace, SQL or internal identifier is returned

  @audience:anonymous @usecase:public-class-empty @category:empty-overflow @quality:functional @severity:medium @status:planned
  Scenario: A published class with no open cohorts still renders
    Given a published class with no published, not-yet-ended cohorts
    When an anonymous visitor fetches the class via the gateway
    Then the class detail is returned with an empty cohorts list

  @audience:anonymous @usecase:public-class-action-gate @category:permission @quality:security @severity:high @status:planned
  Scenario: Registering sends an anonymous visitor to sign in, then back
    Given an anonymous visitor on a public class page
    When they click Register
    Then they are sent to sign in
    And after signing in they return to the same class page

  # ---- Admin / class owner: authoring guards (@security) --------------------

  @audience:admin @usecase:short-description-cap @category:boundary @quality:functional @severity:high
  Scenario: short_description over 140 characters is rejected
    Given a class author editing a class
    When they enter a short_description longer than 140 characters
    Then the form rejects it at the validator boundary

  @audience:admin @usecase:short-description-cap @category:boundary @quality:reliability @severity:high
  Scenario: The database enforces the 140-character short_description ceiling
    Given a direct insert of a class row
    When short_description exceeds 140 characters
    Then the insert is rejected by the classes_short_description_len CHECK

  @audience:admin @usecase:short-description-xss @category:adverse @quality:security @severity:high
  Scenario: An XSS payload in short_description is rejected
    Given a class author editing a class
    When they enter a script tag in short_description
    Then the form rejects it at the validator boundary

  @audience:admin @usecase:deliverables-validation @category:adverse @quality:security @severity:high
  Scenario: Deliverables reject oversize items and XSS
    Given a class author editing a class
    When they enter a deliverable over 200 characters or containing a script tag
    Then the form rejects it at the validator boundary

  @audience:admin @usecase:deliverables-autosave @category:concurrency @quality:reliability @severity:critical
  Scenario: Editing a class never wipes its saved deliverables
    Given an existing class that has deliverables
    When the author edits any field and autosave fires
    Then the saved deliverables are preserved, not overwritten with an empty list
