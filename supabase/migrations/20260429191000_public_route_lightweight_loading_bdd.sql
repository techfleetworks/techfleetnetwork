INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area_number,
  feature_area,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
)
VALUES
(
  'PERF-PUBLIC-ROUTE-SHELL-036',
  36,
  'Public Route Lightweight Loading',
  'Public routes mount without authenticated layout overhead',
  'Feature: Public route lightweight loading

  Scenario: Landing route avoids authenticated shell services
    Given a visitor opens the public landing page
    When the route tree renders the landing route
    Then the page is wrapped in PublicShell
    And AppLayout is not mounted for that public route
    And IdleTimeoutGuard is not mounted for that public route
    And SelfHealingRunner is not mounted for that public route

  Scenario: Public auth routes are split from the initial bundle
    Given a visitor opens the public landing page
    When the route definitions are loaded
    Then LoginPage is imported through lazyWithRetry
    And RegisterPage is imported through lazyWithRetry
    And NotFound is imported through lazyWithRetry',
  'built',
  'unit',
  'src/test/ui/PublicRouteLoading.security.test.tsx',
  'Prevents public visitors from paying authenticated application shell and background-service cost.'
),
(
  'PERF-AUTH-SERVICE-ISOLATION-037',
  37,
  'Authenticated Background Service Isolation',
  'Authenticated-only background components are isolated to protected shells',
  'Feature: Authenticated service isolation

  Scenario: Protected member routes retain authenticated background services
    Given an authenticated member opens a protected route
    When the route tree renders AuthenticatedShell
    Then AppLayout is mounted
    And IdleTimeoutGuard is mounted
    And SelfHealingRunner is mounted

  Scenario: Admin routes retain authenticated background services
    Given an administrator opens an admin route
    When the route tree renders AdminShell
    Then AppLayout is mounted
    And IdleTimeoutGuard is mounted
    And SelfHealingRunner is mounted',
  'built',
  'unit',
  'src/test/ui/PublicRouteLoading.security.test.tsx',
  'Maintains security/session controls for authenticated surfaces while removing them from public routes.'
),
(
  'PERF-DEFERRED-NETWORK-ACTIVITY-038',
  38,
  'Deferred Landing Network Activity',
  'Landing page network activity loads after initial public-page work',
  'Feature: Deferred landing network activity

  Scenario: NetworkActivity preserves layout while deferring heavy work
    Given a visitor opens the landing page
    When the network activity section is below the viewport
    Then a reserved fallback area is rendered
    And NetworkActivity is not mounted until intersection or bounded timeout
    And the page preserves section height to avoid layout shift',
  'built',
  'unit',
  'src/test/ui/DeferredSection.test.tsx; src/test/ui/PublicRouteLoading.security.test.tsx',
  'Reduces public landing initial heap and script work while preserving layout stability.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area_number = EXCLUDED.feature_area_number,
  feature_area = EXCLUDED.feature_area,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
