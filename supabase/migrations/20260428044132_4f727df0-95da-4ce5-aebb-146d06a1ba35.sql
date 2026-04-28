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
  'DISCORD-LINK-VISIBILITY-RESET-001',
  'Discord Identity Linking',
  64,
  'Visibility failure clears stale Discord member selection',
  'Feature: Discord account linking
  Scenario: A selected Discord member becomes unavailable before confirmation
    Given I searched for a Discord username and matching members are displayed
    When I select a member that can no longer be confirmed as visible in the Tech Fleet server
    Then the selected stale member is removed from the displayed results
    And I can immediately search again without being stuck on the same error
    And the app does not link any Discord account until a currently visible server member is selected',
  'implemented',
  'unit',
  'src/test/ui/ConnectDiscordPage.test.tsx',
  'Regression coverage for stale candidate reset after Discord member visibility confirmation failures.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area = EXCLUDED.feature_area,
  feature_area_number = EXCLUDED.feature_area_number,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();