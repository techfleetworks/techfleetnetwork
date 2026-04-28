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
  'DISCORD-LINK-SELECTED-LABEL-001',
  'Discord Identity Linking',
  64,
  'Selected Discord account shows actual display name and username',
  'Feature: Discord account linking
  Scenario: A search term differs from the selected Discord username
    Given I search for a Discord account using a partial name like "Morgan"
    And the matching server member has display name "Kim Morgan" and username "kmorgan"
    When I select that matching member
    Then the app shows "Kim Morgan - @kmorgan" as the selected account
    And the linked Discord username is "kmorgan"
    And the app does not show the original search term as the linked username',
  'implemented',
  'unit',
  'src/test/ui/ConnectDiscordPage.test.tsx',
  'Regression coverage for showing the selected Discord member identity instead of echoing the search term.'
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
