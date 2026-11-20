# Public-access B10: public classes pages (catalog at /courses, detail at /classes/:slug).
#
# Audiences (owner, 2026-11-16 / 2026-11-18):
#   - anonymous    : a logged-out visitor
#   - authenticated: a signed-in member (same detail page; member CTA + cohort extras)
#
# @status:proven scenarios are backed NOW by executable tests:
#   - src/test/ui/PublicCoursesPage.test.tsx
#   - src/test/ui/PublicClassDetailPage.test.tsx
# @status:planned scenarios (axe a11y, dark mode, SEO crawl, responsive) get their
# e2e/visual spec in the B-phase, per the repo ratchet.

Feature: Public classes pages (B10)

  A logged-out visitor can browse the catalog at /courses (free Onboarding Courses +
  Basic/Advanced Training classes) and open a class detail at /classes/:slug, with
  Join Platform CTAs that carry them back after sign-in. A signed-in member keeps
  their progress hub at /courses and, on a class detail, registers on Gumroad.

  # ---- Catalog (@functional) ------------------------------------------------

  @audience:anonymous @usecase:catalog-tabs @category:happy @quality:functional @severity:high @status:proven
  Scenario: The catalog shows the Onboarding / Basic / Advanced tabs
    Given a logged-out visitor on /courses
    When the catalog renders
    Then they see the Onboarding Courses, Basic Training and Advanced Training tabs

  @audience:anonymous @usecase:catalog-class-tile @category:happy @quality:functional @severity:high @status:proven
  Scenario: A class tile offers View details and Join Platform
    Given a logged-out visitor viewing a training tab with a published class
    When the tile renders
    Then it shows View details (to the class page) and Join Platform
    And Join Platform carries an open-redirect-safe return path to the class

  @audience:anonymous @usecase:catalog-course-tile @category:happy @quality:functional @severity:medium @status:proven
  Scenario: A free course tile offers Join Platform
    Given a logged-out visitor on the Onboarding Courses tab
    When a Core course tile renders
    Then it shows the course and a Join Platform action

  @audience:anonymous @usecase:catalog-class-no-cohort @category:boundary @quality:functional @severity:high @status:proven
  Scenario: A published class with no open cohort is still listed, honestly
    Given a logged-out visitor on a training tab with a published class that has no open cohort
    When the tile renders
    Then the class is shown (same visibility as the authenticated list)
    And its status reads "Enrollment not open", not "Registration open"

  @audience:anonymous @usecase:catalog-empty @category:boundary @quality:functional @severity:medium @status:proven
  Scenario: An empty tab shows a join CTA, not a dead end
    Given a training tab with no published classes
    When it renders
    Then an empty-state message and a Join Platform action are shown

  @audience:anonymous @usecase:catalog-error @category:adverse @quality:reliability @severity:medium @status:planned
  Scenario: A catalog fetch error shows a recoverable message
    Given the catalog request fails
    When the tab renders
    Then an error message and a Join Platform action are shown

  # ---- Class detail (@functional / @security) -------------------------------

  @audience:anonymous @usecase:detail-renders @category:happy @quality:functional @severity:high @status:proven
  Scenario: The class detail shows the class and its schedule
    Given a logged-out visitor on /classes/:slug for a published class
    When the page renders
    Then the title, summary and the cohort schedule (label + dates) are shown

  @audience:anonymous @usecase:detail-anon-cta @category:happy @quality:security @severity:high @status:proven
  Scenario: An anonymous visitor is sent to Join Platform to register
    Given a logged-out visitor on a class detail with an open cohort
    When the cohort card renders
    Then the CTA is Join Platform with a return path back to the class

  @audience:authenticated @usecase:detail-member-cta @category:happy @quality:functional @severity:high @status:proven
  Scenario: A signed-in member registers on Gumroad
    Given a signed-in member on a class detail with an open cohort
    When the cohort card renders
    Then the CTA is Register on Gumroad, linking to the cohort registration URL

  @audience:anonymous @usecase:detail-not-found @category:negative @quality:functional @severity:medium @status:proven
  Scenario: An unknown or unpublished class shows a not-found page
    Given a slug with no published class
    When the detail page renders
    Then a not-found message and a link back to the catalog are shown

  @audience:anonymous @usecase:detail-no-raw-html @category:adverse @quality:security @severity:high @status:planned
  Scenario: Teacher-authored free text never renders as raw HTML
    Given a class whose description contains markup
    When the detail page renders
    Then the markup is shown as text, not injected into the DOM

  @audience:anonymous @usecase:catalog-a11y @category:happy @quality:accessibility @severity:high @status:planned
  Scenario: The catalog and detail pages have no automated a11y violations
    Given a rendered catalog or detail page
    When it is scanned with axe
    Then there are no critical or serious violations
