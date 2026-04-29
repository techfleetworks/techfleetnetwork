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
) VALUES
(
  'SEC-FLEETY-LOG-REDACTION-032',
  'Security: OWASP Chat Widget Logging',
  32,
  'Fleety widget redacts chat errors and avoids provider error disclosure',
  'Feature: OWASP A02/A09 Fleety widget error handling
  As a platform security reviewer
  I want chat widget errors logged through a redacting logger
  So that user prompts, provider payloads, and internal details are not exposed

  Scenario: Widget chat failures use structured redacted logs
    Given an authenticated trainee asks Fleety a question from the floating widget
    When the backend chat request fails
    Then the client records only bounded metadata through the centralized logger
    And no raw console error receives the exception object

  Scenario: Widget chat failures show a generic recovery message
    Given the backend returns an internal or provider-specific error
    When the widget handles the failure
    Then the trainee sees a generic retry message
    And the raw backend error text is not displayed',
  'implemented'::public.bdd_status,
  'unit'::public.bdd_test_type,
  'src/test/ui/FleetyChat.security.test.tsx',
  'Covers OWASP A02 information disclosure prevention and A09 security logging for FleetyChatWidget.'
),
(
  'SEC-GUIDANCE-LOG-REDACTION-033',
  'Security: OWASP Guidance Chat Logging',
  33,
  'Guidance embed redacts chat errors and enforces bounded input',
  'Feature: OWASP A02/A09/LLM10 Guidance embed hardening
  As a platform security reviewer
  I want guidance chat failures and input limits handled safely
  So that internal errors are not leaked and unbounded prompt consumption is prevented

  Scenario: Guidance chat failures use structured redacted logs
    Given a trainee asks Fleety a question from the guidance embed
    When the backend chat request fails
    Then the client records only bounded metadata through the centralized logger
    And no raw console error receives the exception object

  Scenario: Guidance chat input is bounded at the enforced prompt limit
    Given a trainee types a long prompt
    When the prompt reaches the configured maximum input length
    Then the input stops at that limit
    And the submitted payload is truncated to the same maximum length',
  'implemented'::public.bdd_status,
  'unit'::public.bdd_test_type,
  'src/test/ui/FleetyChat.security.test.tsx',
  'Covers OWASP A02 information disclosure prevention, A09 security logging, and LLM10 unbounded consumption controls for GuidanceEmbed.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();