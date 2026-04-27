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
  'AUTH-CAPTCHA-FAILURE-TELEMETRY-20260427',
  52,
  'Authentication Security',
  'CAPTCHA telemetry only stores failure events',
  'Feature: CAPTCHA telemetry minimization
  Scenario: CAPTCHA challenge is displayed without failure
    Given a user opens an authentication page with CAPTCHA enabled
    When the CAPTCHA challenge is shown
    Then no account activity telemetry is written for the display event

  Scenario: CAPTCHA verification fails
    Given a user submits an authentication form without a valid CAPTCHA token
    When verification fails or auth throttling blocks the request
    Then account activity telemetry is written for the failure or blocked request only',
  'implemented',
  'unit',
  'src/test/lib/auth-captcha.test.ts',
  'Telemetry minimization prevents high-volume challenge display events from generating unnecessary database writes while preserving failure visibility.'
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