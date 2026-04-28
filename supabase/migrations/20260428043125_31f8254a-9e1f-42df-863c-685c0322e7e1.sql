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
  'DISCORD-LINK-CLAIMED-001',
  'Discord Identity Verification',
  42,
  'Claimed Discord account cannot be linked to another profile',
  'Feature: Discord identity verification
  As a Tech Fleet member
  I want Discord linking to use verified server membership and ownership checks
  So that one real Discord account cannot be attached to multiple platform profiles

  Scenario: A member selects a Discord account already claimed by another profile
    Given I am signed in as a different Tech Fleet member
    And the selected Discord account exists in the Tech Fleet Discord server
    And that Discord account or exact Discord username is already linked to another profile
    When I confirm that Discord account from the search results
    Then the system rejects the link
    And my profile Discord fields are not changed
    And I see a clear message that the Discord account is already linked',
  'implemented',
  'unit',
  'supabase/functions/resolve-discord-id/index.ts',
  'Server-side verification must reject duplicate Discord IDs and exact usernames before profile updates.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();