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
  86,
  'Onboarding and authentication flow',
  'AUTH-CAPTCHA-TOKEN-001',
  'Auth requests submit the active human verification token',
  'Feature: Human verification for auth email actions
Scenario: Member resends a signup confirmation email after completing verification
  Given a member has completed the visible human verification challenge
  When they request another signup confirmation email
  Then the app sends the same active verification token with the auth request
  And the member does not see a false prompt to complete verification again',
  'implemented',
  'unit',
  'src/test/ui/RegisterPage.test.tsx; src/services/auth.service.ts; src/pages/RegisterPage.tsx',
  'Regression coverage for consuming Turnstile tokens before confirmation resend auth calls.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
