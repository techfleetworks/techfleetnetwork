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
  'SEC-SESSION-IDLE-30MIN-039',
  39,
  'Session Inactivity Timeout',
  'Authenticated sessions expire after 30 minutes of inactivity',
  'Feature: Session inactivity timeout

  Scenario: Authenticated users receive a warning before 30 minutes of inactivity
    Given an authenticated user has been inactive for 28 minutes
    When the idle timeout guard evaluates the session
    Then the session expiration warning is shown
    And the user can choose to stay signed in

  Scenario: Authenticated users are signed out after 30 minutes of inactivity
    Given an authenticated user has been inactive for more than 30 minutes
    When the idle timeout policy evaluates the session
    Then the user is signed out
    And session_idle_timeout telemetry is recorded

  Scenario: Sessions remain valid before 30 minutes of inactivity
    Given an authenticated user has been inactive for 25 minutes
    When the client session policy evaluates the session
    Then the session remains valid
    And the user is not signed out',
  'built',
  'unit',
  'src/test/ui/IdleTimeoutGuard.policy.test.tsx; src/test/services/auth.service.test.ts; src/test/lib/security-extended.test.ts',
  'Updates the previous 20-minute idle policy to 30 minutes while keeping the two-minute warning and absolute max-session guard.'
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
