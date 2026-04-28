CREATE OR REPLACE FUNCTION public.prevent_unverified_discord_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND (
       NEW.discord_username IS DISTINCT FROM OLD.discord_username
       OR NEW.discord_user_id IS DISTINCT FROM OLD.discord_user_id
     ) THEN
    NEW.discord_username := OLD.discord_username;
    NEW.discord_user_id := OLD.discord_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_verified_discord_fields ON public.profiles;
CREATE TRIGGER protect_verified_discord_fields
BEFORE UPDATE OF discord_username, discord_user_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unverified_discord_change();

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
  'DISCORD-LINK-SERVER-TRUSTED-WRITE-001',
  'Discord Identity Linking',
  21,
  'Profile edits cannot overwrite a verified Discord account',
  'Feature: Discord Identity Linking
  Scenario: Free-text profile edits cannot replace verified Discord account details
    Given a member has a verified Discord account linked by Discord user ID
    When the member edits profile or application free-text Discord username fields
    Then the verified Discord username and Discord user ID remain unchanged
    And only the trusted Discord verification backend can update those account fields',
  'implemented',
  'unit',
  'src/test/services/profile.service.test.ts',
  'Regression coverage for preventing fake Discord usernames from replacing confirmed Discord member records.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();