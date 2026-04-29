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
  'SEC-INTERVIEW-SCHEDULE-013',
  'Security hardening',
  90,
  'Interview scheduling validates ownership and sanitizes operational telemetry',
  'Feature: Secure interview scheduling confirmation\n  Scenario: Applicant marks only their own invited application as scheduled\n    Given an authenticated applicant submits an interview scheduling confirmation\n    When the backend receives the request\n    Then the request body must be valid JSON within the allowed size\n    And the application identifier must be a valid UUID\n    And the application must belong to the caller\n    And the application must be in the invited-to-interview state\n    And notification, fallback, and audit failures must be logged without exposing applicant names, client names, or raw backend errors',
  'implemented',
  'unit',
  'supabase/functions/mark-interview-scheduled/validation_test.ts',
  'OWASP A01/A03/A05/A09 hardening for applicant interview scheduling confirmation.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();