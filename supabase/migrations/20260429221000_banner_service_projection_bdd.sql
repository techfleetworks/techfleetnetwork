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
VALUES (
  'SEC-BANNER-SERVICE-PROJECTION-051',
  51,
  'OWASP A02 Announcement Banner Data Projection',
  'Announcement banner service queries use explicit field allowlists',
  'Feature: OWASP A02 announcement banner data minimization

  Scenario: Banner service avoids wildcard projections
    Given banners are loaded for admins or published display
    When the banner service queries banner data
    Then each banner query uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Banner dismissal payloads are intentionally bounded
    Given a user dismisses or views a banner
    When dismissal data is loaded
    Then only banner identifiers required for visibility are requested
    And unrelated private, network, and administrative metadata is not over-fetched',
  'implemented',
  'unit',
  'src/test/services/banner.service.security.test.ts',
  'Covers OWASP A02 data minimization for admin and published announcement banner reads.'
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
