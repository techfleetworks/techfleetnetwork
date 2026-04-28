INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  'DISCORD-LINK-RETRY-001',
  'Discord Identity Verification',
  42,
  'Discord verification retry shows accurate status',
  'Feature: Discord identity verification reliability
  As a Tech Fleet member
  I want Discord verification errors to explain the real issue
  So that I know whether to retry, pick another account, or contact support

  Scenario: Discord verification has a transient or rejected lookup then succeeds
    Given I am signed in as a Tech Fleet member
    And I search for a Discord username from the connector
    When the verification backend returns a specific recoverable response
    Then the UI shows that specific response instead of a generic temporary outage
    And I can retry the search without losing my entered Discord username
    And a later successful response shows selectable Discord server members',
  'implemented',
  'unit',
  'src/services/discord-notify.service.ts',
  'Client service must parse backend error bodies and avoid false outage messages for Discord connector retries.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();