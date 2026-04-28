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
) VALUES
(
  86,
  'Onboarding and authentication flow',
  'ONBOARD-GOOGLE-REDIRECT-001',
  'Google sign-in preserves the intended destination',
  'Feature: Smooth onboarding via Google sign-in
Scenario: Visitor signs in with Google and lands on the expected destination
  Given a visitor starts account creation from the homepage or a project page
  And the app stores the intended return path
  When they complete Google sign-in
  Then the app returns them to the stored safe path
  And they do not need to backtrack from the default dashboard',
  'implemented',
  'unit',
  'src/components/GoogleSignInButton.tsx; src/contexts/AuthContext.tsx',
  'Regression coverage for OAuth flows losing their redirect target.'
),
(
  86,
  'Onboarding and authentication flow',
  'REGISTER-FRICTION-VALIDATION-001',
  'Registration validates efficiently without unnecessary reloads or lockouts',
  'Feature: Extended registration attempts with repeated form interactions
Scenario: Member receives actionable validation before submitting repeatedly
  Given a visitor is completing email registration
  When they interact with registration fields and submit invalid values
  Then validation explains what needs attention in-place
  And invalid form submissions do not increase security lockout counters
  And the page stays stable without forcing refreshes or revisits',
  'implemented',
  'unit',
  'src/pages/RegisterPage.tsx; src/services/auth.service.ts',
  'Regression coverage for repeated registration clicks, dead clicks, and reload-driven recovery.'
),
(
  49,
  'Course module completion',
  'COURSE-COMPLETION-STABLE-001',
  'Rapid course completion remains stable',
  'Feature: Course module completion sequences
Scenario: Member completes several lessons in succession
  Given a signed-in member is progressing through a course module
  When they mark lessons complete and advance repeatedly
  Then navigation remains stable
  And each completion action gives clear status feedback
  And no unrelated authentication or onboarding prompt interrupts the sequence',
  'implemented',
  'both',
  'src/components/GenericCoursePage.tsx',
  'Documents the observed healthy course behavior as a regression guard.'
),
(
  87,
  'Project application entry',
  'PROJECT-APPLY-PRELOGIN-MOMENTUM-001',
  'Pre-login apply action explains sign-in and resumes after authentication',
  'Feature: Project application exploration ending at login prompt
Scenario: Visitor applies from a project opening before signing in
  Given a visitor is viewing a project opening
  When they choose to apply
  Then the app explains that sign-in is needed to continue
  And stores the exact application path
  And after authentication the visitor resumes the application instead of stopping at login',
  'implemented',
  'unit',
  'src/pages/ProjectOpeningsPage.tsx; src/pages/ProjectOpeningDetailPage.tsx; src/pages/LoginPage.tsx',
  'Regression coverage for application intent being lost at the login prompt.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();