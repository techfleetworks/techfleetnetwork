# Public-access B11: the logged-out project-openings catalog at /project-openings.
#
# Audiences:
#   - anonymous : a logged-out visitor (sees the public openings list + can open detail)
#   - authenticated: a signed-in member (gets the progress-rich ProjectOpeningsPage)
#
# The public project DETAIL page already served anon (ProjectOpeningDetailPage via
# the public-project-detail gateway, A4/A5); B11 adds the public LISTING + surfaces
# it in the logged-out nav. @status:proven scenarios are backed by
# src/test/ui/PublicProjectOpeningsPage.test.tsx,
# src/test/hooks/use-public-project-openings.test.tsx, and the nav policy/items tests.

Feature: Public project openings list (B11)

  A logged-out visitor can browse open projects at /project-openings and see each
  project's title, the roles (team hats) its team is looking for, and its status,
  then open a project to learn more. Applying requires joining the platform. The
  anon field set is enforced by the public-project-openings gateway (no phase, no
  application counts, no client kind/status).

  @audience:anonymous @usecase:openings-list @category:happy @quality:functional @severity:high @status:proven
  Scenario: The openings page lists visible projects with their roles
    Given a logged-out visitor on /project-openings
    When the page renders
    Then each open project is shown with its title, status, and team-hat roles
    And each tile offers a single "View opening" action

  @audience:anonymous @usecase:openings-view-detail @category:happy @quality:functional @severity:medium @status:proven
  Scenario: View opening links to the public project detail page
    Given a logged-out visitor on /project-openings
    When they choose "View opening" on a project
    Then they go to that project's public detail page (/project-openings/:id)

  @audience:anonymous @usecase:openings-apply-gated @category:permission @quality:security @severity:high @status:proven
  Scenario: Applying requires joining first (no anon apply)
    Given a logged-out visitor on a project opening
    When they choose the join/apply action
    Then they are sent to sign in with an open-redirect-safe return to that opening
    And no application is created while anonymous

  @audience:anonymous @usecase:openings-order @category:happy @quality:functional @severity:low @status:proven
  Scenario: Projects accepting applications are listed before those opening soon
    Given visible projects in several statuses
    When the page renders
    Then accepting-applications projects appear before opening-soon projects

  @audience:anonymous @usecase:openings-empty @category:empty-overflow @quality:functional @severity:medium @status:proven
  Scenario: An empty list never dead-ends the visitor
    Given there are no visible project openings
    When the page renders
    Then a "no open projects right now" message and a Join Platform action are shown

  @audience:anonymous @usecase:openings-error @category:error @quality:reliability @severity:medium @status:proven
  Scenario: A gateway failure shows a recoverable error, not a blank page
    Given the public-project-openings gateway fails or times out
    When the page renders
    Then an error message and a Join Platform action are shown

  @audience:authenticated @usecase:openings-member-unchanged @category:happy @quality:functional @severity:high @status:proven
  Scenario: A signed-in member still gets the member openings page
    Given a signed-in member navigates to /project-openings
    When the route resolves
    Then the progress-rich member ProjectOpeningsPage is shown, not the public catalog

  @audience:anonymous @usecase:openings-nav @category:happy @quality:functional @severity:medium @status:proven
  Scenario: Project Openings appears in the logged-out navigation
    Given a logged-out visitor
    When the public nav renders
    Then a "Project Openings" item links to /project-openings
