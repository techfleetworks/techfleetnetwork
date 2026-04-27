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
  80,
  'Email delivery resilience',
  '80.1',
  'Queued emails use supported provider purpose before retrying',
  'Feature: Email delivery resilience
  Scenario: Queued auth and app emails use the supported sending purpose
    Given an email is queued for delivery
    When the dispatcher sends it to the email provider
    Then the outbound request uses the supported app-email purpose
    And auth emails still use the priority auth queue
    And invalid purpose errors do not repeat until dead-letter routing',
  'implemented',
  'manual',
  'supabase/functions/process-email-queue/index.ts',
  'Regression coverage for invalid purpose failures causing five retries and DLQ events.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
