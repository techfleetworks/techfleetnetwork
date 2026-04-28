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
  18,
  'Registration and email verification',
  'AUTH-CONFIRM-RESEND-002',
  'Signup confirmation resend has visible human verification',
  'Feature: Registration and email verification
  Scenario: User resends a signup confirmation email after completing visible verification
    Given a newly registered user is on the check your email screen
    And the resend action is protected by human verification
    When the user completes the visible verification and requests another email
    Then the app verifies the challenge before calling the resend flow
    And the resend request is not blocked by hidden client-side verification requirements',
  'implemented',
  'unit',
  'src/test/ui/RegisterPage.test.tsx',
  'Regression coverage for signup confirmation resend failures caused by hidden CAPTCHA enforcement.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();