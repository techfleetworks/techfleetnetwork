# Public-access B8: single-URL, auth-conditional navigation shell.
#
# Audiences (established with the owner, 2026-11-16 / 2026-11-18):
#   - anonymous    : a logged-out visitor browsing the public surface
#   - authenticated: a signed-in member (full app nav)
#
# Decisions (owner, 2026-11-18): logged-out CTAs = "Sign In" + "Join Platform";
# the catalog nav item is "Courses" (route /courses, no rename). The same URL
# serves both auth states — only the shell differs.
#
# Scenarios tagged @status:proven are backed NOW by executable tests:
#   - src/test/ui/AppLayout.test.tsx        (shell: public nav, CTAs, no authed items)
#   - src/test/lib/auth-gated-redirect.test.ts   (redirect-back, open-redirect guard)
#   - src/test/lib/public-nav-items.test.ts (nav ↔ A5 policy binding)
# @status:planned scenarios get their e2e spec in the B-phase (per the repo ratchet:
# registered `implemented` only once a real test backs them).

Feature: Public navigation shell (B8)

  The app shell serves both auth states on the same URL. A logged-out visitor sees
  a theme-aware nav (sidebar on desktop, hamburger on mobile) with only the public
  items and Sign In / Join Platform CTAs; authed members see the full app nav.

  # ---- Anonymous visitor (@security / @functional) --------------------------

  @audience:anonymous @usecase:public-nav-items @category:happy @quality:functional @severity:high @status:proven
  Scenario: The logged-out nav shows only the public items
    Given a logged-out visitor on a public page
    When the nav shell renders
    Then they see Home, Courses and Project Openings
    And they see the Sign In and Join Platform actions

  @audience:anonymous @usecase:public-nav-no-authed-items @category:permission @quality:security @severity:critical @status:proven
  Scenario: Authed-only nav items never appear for a logged-out visitor
    Given a logged-out visitor on a public page
    When the nav shell renders
    Then no authenticated-only item (Announcements, My Journey, Applications, Recruiting Center, User Admin) is shown

  @audience:anonymous @usecase:public-nav-redirect-back @category:happy @quality:security @severity:high @status:proven
  Scenario: Sign In and Join Platform return the visitor to the current page
    Given a logged-out visitor on a public page
    When they open Sign In or Join Platform
    Then the link carries a same-origin redirect back to the current page

  @audience:anonymous @usecase:public-nav-open-redirect @category:adverse @quality:security @severity:critical @status:proven
  Scenario: A crafted return path cannot bounce the visitor off-origin
    Given a return path pointing at an external or protocol-relative URL
    When the Sign In / Join Platform link is built
    Then the off-origin target is rejected and the fallback is the site root

  @audience:anonymous @usecase:public-nav-same-url @category:happy @quality:functional @severity:high @status:planned
  Scenario: The same public URL opens for logged-out and logged-in visitors
    Given a public path such as /courses
    When a logged-out visitor and a signed-in member each open it
    Then both see the page content at the same URL, with their own shell

  @audience:anonymous @usecase:public-nav-mobile @category:boundary @quality:functional @severity:medium @status:planned
  Scenario: On a small screen the public nav collapses into a hamburger menu
    Given a logged-out visitor on a narrow viewport
    When they open the menu
    Then the public items and the Sign In / Join Platform actions are listed

  @audience:anonymous @usecase:public-nav-a11y @category:happy @quality:accessibility @severity:high @status:planned
  Scenario: The public nav is keyboard and screen-reader navigable
    Given a logged-out visitor using a keyboard and screen reader
    When they traverse the shell
    Then a Skip to main content link is first, the nav is labeled, and the current item carries aria-current

  # ---- Authenticated member (@functional) -----------------------------------

  @audience:authenticated @usecase:authed-nav-full @category:happy @quality:functional @severity:high @status:planned
  Scenario: A signed-in member sees the full app nav, not the public shell
    Given a signed-in member
    When the shell renders
    Then they see their member nav (Home/dashboard, Community, Training) and account menu
    And the Sign In / Join Platform CTAs are absent
