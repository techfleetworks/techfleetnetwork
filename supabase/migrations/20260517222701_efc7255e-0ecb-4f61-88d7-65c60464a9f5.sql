INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, notes)
SELECT 'Deployment', 24, 'DEPLOY-BOOT-001',
  'App shell renders before third-party consent script loads',
  'Feature: Resilient app startup

  Scenario: Third-party consent script cannot blank the app on load
    Given a visitor opens Tech Fleet Network on the published domain
    And the CookieYes consent service is slow, redirects, or renders a blocking banner
    When the page starts loading
    Then [UI] the React app shell mounts and renders visible Tech Fleet content before the consent script is appended
    And [Code] CookieConsentBanner loads CookieYes asynchronously after React effects run
    And [Code] analytics remain disabled until an accepted consent event is received
    And [DB] no consent record is created unless CookieYes emits a consent update or Global Privacy Control requires a deny record',
  'implemented', 'unit',
  'Added after production blank-screen investigation: CookieYes was moved out of parser-blocking index.html and into the mounted consent shim.'
WHERE NOT EXISTS (SELECT 1 FROM public.bdd_scenarios WHERE scenario_id = 'DEPLOY-BOOT-001');