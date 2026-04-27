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
  '79.2',
  'Verified passkey does not reopen the login gate',
  'Feature: Admin passkey security gate
  Scenario: Successful passkey verification closes the gate without reopening
    Given an authenticated admin has an enrolled passkey
    And a background trusted-device check is still in flight
    When the admin successfully verifies with their passkey
    Then the passkey gate is marked verified immediately
    And stale background check results must not reopen the dialog
    And the verified device remains trusted for 30 days unless revoked',
  'implemented',
  'unit',
  'src/hooks/use-passkey-login-gate.ts',
  'Regression coverage for passkey prompt loops caused by stale async verification checks.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
