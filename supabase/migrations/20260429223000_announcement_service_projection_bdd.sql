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
  'SEC-ANNOUNCEMENT-SERVICE-PROJECTION-053',
  53,
  'OWASP A02 Announcement Service Data Projection',
  'Announcement service queries use explicit field allowlists',
  'Feature: OWASP A02 announcement service data minimization

  Scenario: Announcement service avoids broad projections
    Given announcements are listed or created
    When the announcement service queries announcement data
    Then each returned announcement payload uses an explicit field allowlist
    And no query uses wildcard or implicit selection

  Scenario: Announcement read receipts are bounded
    Given a member views or reads an announcement
    When read receipt records are queried or returned
    Then only announcement identifiers required for read state are requested
    And unrelated private, device, and network metadata is not over-fetched',
  'implemented',
  'unit',
  'src/test/services/announcement.service.security.test.ts',
  'Covers OWASP A02 data minimization for announcement list/create/read-receipt flows.'
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
