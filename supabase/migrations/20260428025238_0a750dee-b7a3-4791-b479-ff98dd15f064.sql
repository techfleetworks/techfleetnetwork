INSERT INTO public.bdd_scenarios (
  feature_area_number,
  feature_area,
  scenario_id,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  81,
  'Discord identity linking',
  'DISCORD-CONNECT-EXACT-001',
  'Exact Discord member match links without false not-found error',
  'Feature: Discord identity linking
  Scenario: Existing Discord member enters an exact username
    Given a signed-in Tech Fleet member is already in the Tech Fleet Discord server
    And the Discord lookup returns a verified member ID for the entered username
    When the member checks their Discord connection
    Then the app links that Discord account immediately
    And the app must not show a not-found error for a verified exact match',
  'implemented',
  'unit',
  'src/pages/ConnectDiscordPage.tsx; supabase/functions/resolve-discord-id/index.ts',
  'Regression coverage for false not-found Discord connect errors when the backend returned discord_user_id without candidates.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();