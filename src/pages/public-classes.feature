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
  Basic/Advanced Training classes) and open a class detail at /classes/:slug. Each
  catalog tile has a single "View details" CTA (the per-card Join Platform CTA was
  removed, owner 2026-11-25); empty and error states keep a Join Platform CTA. A
  signed-in member keeps their progress hub at /courses and registers on Gumroad.

  # ---- Catalog (@functional) ------------------------------------------------

  @audience:anonymous @usecase:catalog-tabs @category:happy @quality:functional @severity:high @status:proven
  Scenario: The catalog shows the Onboarding / Basic / Advanced tabs
    Given a logged-out visitor on /courses
    When the catalog renders
    Then they see the Onboarding Courses, Basic Training and Advanced Training tabs

  @audience:anonymous @usecase:catalog-class-tile @category:happy @quality:functional @severity:high @status:proven
  Scenario: A class tile offers a single View details action
    Given a logged-out visitor viewing a training tab with a published class
    When the tile renders
    Then it shows a single "View details" action linking to the class page
    And no per-card Join Platform CTA is shown

  @audience:anonymous @usecase:catalog-course-tile @category:happy @quality:functional @severity:medium @status:proven
  Scenario: A free course tile offers a single View details action
    Given a logged-out visitor on the Onboarding Courses tab
    When a Core course tile renders
    Then it shows the course and a single "View details" action to the course page

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

  @audience:anonymous @usecase:detail-register-cta @category:happy @quality:functional @severity:high @status:proven
  Scenario: An open cohort sends a logged-out visitor straight to Register on Gumroad
    Given a logged-out visitor on a class detail with a register_now cohort
    When the cohort card renders
    Then the CTA is Register, linking to the cohort's Gumroad URL in a new tab
    And it is not the old "Join Platform to register" (ADR 20261120-public-register-cta)

  @audience:authenticated @usecase:detail-member-cta @category:happy @quality:functional @severity:high @status:proven
  Scenario: A signed-in member gets the same Register-on-Gumroad link
    Given a signed-in member on a class detail with a register_now cohort
    When the cohort card renders
    Then the CTA is Register, linking to the cohort registration URL

  @audience:anonymous @usecase:detail-coming-soon @category:boundary @quality:functional @severity:medium @status:proven
  Scenario: A coming_soon cohort shows "Opening soon" and no Register button
    Given a logged-out visitor on a class detail whose cohort is coming_soon
    When the cohort card renders
    Then the badge reads "Opening soon" and there is no Register link
    And the enrollment pill is not "Registration open"

  @audience:anonymous @usecase:detail-not-found @category:negative @quality:functional @severity:medium @status:proven
  Scenario: An unknown or unpublished class shows a not-found page
    Given a slug with no published class
    When the detail page renders
    Then a not-found message and a link back to the catalog are shown

  @audience:anonymous @usecase:detail-rich-text-sanitized @category:adverse @quality:security @severity:high @status:proven
  Scenario: Teacher rich-text renders as sanitized HTML, with active markup stripped
    Given a class whose summary contains headings, lists, and a script/onerror payload
    When the detail page renders
    Then the headings and lists render as structured HTML (ADR 20261120-public-rich-text)
    And the script and event-handler markup are stripped, never executed

  @audience:anonymous @usecase:catalog-a11y @category:happy @quality:accessibility @severity:high @status:planned
  Scenario: The catalog and detail pages have no automated a11y violations
    Given a rendered catalog or detail page
    When it is scanned with axe
    Then there are no critical or serious violations
