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
  'AUTH-2FA-SETUP-RECOVERY-003',
  'Authentication security',
  17,
  '2FA setup recovers from stale pending factors',
  'Feature: Authenticator 2FA setup recovery\n  Scenario: A user retries setup after a factor load or enrollment interruption\n    Given a user started authenticator 2FA setup and an unverified factor remains pending\n    When the user retries setup with the same device name\n    Then the app removes stale unverified factors before enrolling\n    And the user sees a clear retry path instead of a duplicate friendly-name error',
  'implemented',
  'unit',
  'src/test/services/mfa.service.test.ts',
  'Regression coverage for polished recovery from transient factor-list failures and stale duplicate pending TOTP factors.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
