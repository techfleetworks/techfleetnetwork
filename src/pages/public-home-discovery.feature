# Public-access B13: discovery links on the logged-out home landing page (/).
#
# Audiences:
#   - anonymous : a logged-out visitor on the public landing page
#   - authenticated: a signed-in member (never sees the landing page — Index.tsx
#     redirects an authed user to /dashboard, so the landing page is anon-only)
#
# The landing page already existed; B13 adds a discovery section that gives a
# logged-out visitor a concrete path INTO the two public surfaces (Courses,
# Project Openings). The section's hrefs are a projection of PUBLIC_NAV_ITEMS
# (the A5/B8 nav-policy source), so they can never drift from policy.
# @status:proven scenarios are backed by src/test/ui/LandingPage.test.tsx and the
# public-nav policy/items tests.

Feature: Public home discovery links (B13)

  A logged-out visitor on the home page can see and follow discovery links into
  the free Courses catalog and the Project Openings list, so the public surfaces
  are reachable from the landing page, not only from the nav. The discovery links
  mirror the routes the public nav policy exposes.

  @audience:anonymous @usecase:home-discovery @category:happy @quality:functional @severity:high @status:proven
  Scenario: The landing page offers discovery links into the public surfaces
    Given a logged-out visitor on the home page
    When the page renders
    Then a discovery section links to the free Courses catalog
    And the discovery section links to the Project Openings list

  @audience:anonymous @usecase:home-discovery-policy-bound @category:boundary @quality:functional @severity:medium @status:proven
  Scenario: Discovery links match exactly the public nav surfaces
    Given the public nav policy exposes a set of logged-out surfaces
    When the landing page discovery section renders
    Then it links exactly those surfaces, excluding Home
    And a newly-public surface with no discovery copy fails the binding test

  @audience:anonymous @usecase:home-discovery-keyboard @category:happy @quality:accessibility @severity:medium @status:proven
  Scenario: Each discovery card is a single keyboard-focusable link with a clear name
    Given a logged-out visitor on the home page
    When they tab to a discovery card
    Then it is one focusable link whose name states the surface it opens
