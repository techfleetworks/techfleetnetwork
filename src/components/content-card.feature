# Public-access B9: the shared, theme-aware listing card (ContentCard).
#
# Audiences (established with the owner, 2026-11-16 / 2026-11-18):
#   - anonymous    : a logged-out visitor browsing the public surface
#   - authenticated: a signed-in member (same card, member actions)
# The SAME card renders for both; only the injected actions differ, and the card
# itself never decides them (it is presentational — auth lives in the caller).
#
# Scenarios tagged @status:proven are backed NOW by executable tests:
#   - src/test/ui/ContentCard.test.tsx
# @status:planned scenarios (dark-mode visual parity, axe a11y, responsive) get
# their e2e/visual spec in the B-phase, per the repo ratchet.

Feature: Shared content card (B9)

  One card component renders a class or a project, identically for a logged-out
  visitor and a signed-in member. It shows an image with the status badge overlaid,
  a title, a meta line, a chip row, a two-line blurb, and two actions (a primary
  join/register/apply and a secondary view-details) pinned to the bottom.

  # ---- Presentation (@functional) -------------------------------------------

  @audience:anonymous @usecase:content-card-renders @category:happy @quality:functional @severity:high @status:proven
  Scenario: The card renders its content
    Given a content card with a title, status, meta, chips and a blurb
    When it renders
    Then the title, status label, meta line, each chip and the blurb are shown
    And both the primary and secondary actions are shown

  @audience:anonymous @usecase:content-card-image-alt @category:happy @quality:accessibility @severity:high @status:proven
  Scenario: The image carries alternative text
    Given a content card with an image URL and alt text
    When it renders
    Then the image exposes that alt text to assistive technology

  @audience:anonymous @usecase:content-card-placeholder @category:boundary @quality:functional @severity:medium @status:proven
  Scenario: With no image the card shows a decorative placeholder
    Given a content card with no image URL
    When it renders
    Then a decorative placeholder is shown and no broken image is rendered

  @audience:anonymous @usecase:content-card-broken-image @category:adverse @quality:functional @severity:medium @status:proven
  Scenario: A broken image URL falls back to the placeholder
    Given a content card whose image URL fails to load
    When the image errors
    Then the image is hidden and the decorative placeholder shows instead of a broken-image glyph

  # ---- Actions (@functional) ------------------------------------------------

  @audience:authenticated @usecase:content-card-action-link @category:happy @quality:functional @severity:high @status:proven
  Scenario: An action with a target renders as a link
    Given a primary action with an href
    When the card renders
    Then that action is a link pointing at the href

  @audience:authenticated @usecase:content-card-action-button @category:happy @quality:functional @severity:high @status:proven
  Scenario: An action with a handler renders as a button
    Given a primary action with an onClick handler and no href
    When the card renders and the action is activated
    Then the handler is called

  # ---- Accessibility (@security/@accessibility) -----------------------------

  @audience:anonymous @usecase:content-card-no-nested-link @category:adverse @quality:accessibility @severity:high @status:proven
  Scenario: The card is not a single giant link wrapping its buttons
    Given a content card with actions
    When it renders
    Then the card root is not a role=link
    And the interactive targets are the title and the action controls

  @audience:anonymous @usecase:content-card-dark-mode @category:happy @quality:accessibility @severity:medium @status:planned
  Scenario: The card is legible in dark mode
    Given the app is in dark mode
    When the card renders
    Then text and the status badge meet WCAG AA contrast on the dark surface

  @audience:anonymous @usecase:content-card-axe @category:happy @quality:accessibility @severity:high @status:planned
  Scenario: The card has no automated accessibility violations
    Given a rendered content card
    When it is scanned with axe
    Then there are no critical or serious violations

  @audience:anonymous @usecase:content-card-responsive @category:boundary @quality:functional @severity:medium @status:planned
  Scenario: The actions stay reachable at 200% zoom and on a narrow screen
    Given a content card with a long title in a narrow column at 200% text zoom
    When it renders
    Then the primary and secondary actions remain visible and are not clipped
