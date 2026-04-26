DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
  END IF;
END;
$$;

INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, test_type, status, test_file)
VALUES (
  'SECURITY-SERVICES-REALTIME-PROFILES-001',
  'Security',
  54,
  'Profile changes are not broadcast over live database channels',
  'Feature: Profile privacy for live updates\n  Scenario: Authenticated member cannot subscribe to profile change broadcasts\n    Given profile records contain personal member information\n    When a profile is created or updated\n    Then the change is not broadcast through live database channels\n    And other authenticated members cannot receive profile change events by subscribing to a channel',
  'manual',
  'implemented',
  'database publication: supabase_realtime excludes public.profiles'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  test_type = EXCLUDED.test_type,
  status = EXCLUDED.status,
  test_file = EXCLUDED.test_file,
  updated_at = now();