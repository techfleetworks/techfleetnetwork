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
  79,
  'Admin passkey security gate',
  '79.1',
  'Passkey verification is not blocked by client request throttling',
  'Feature: Admin passkey security gate
  Scenario: Passkey checks bypass generic rapid request throttling
    Given an authenticated admin is prompted to enter a passkey
    When the app performs trusted-device and passkey verification requests
    Then the generic client request throttle must not block those security requests
    And malicious rapid non-passkey backend requests remain rate limited',
  'implemented',
  'unit',
  'src/test/lib/client-request-throttle.test.ts',
  'Regression coverage for client-side throttle false positives on passkey MFA flows.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
