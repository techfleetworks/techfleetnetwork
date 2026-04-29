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
  'SEC-EMAIL-UNSUBSCRIBE-PROJECTION-052',
  52,
  'OWASP A02 Email Unsubscribe Token Projection',
  'Public email unsubscribe function queries use explicit token allowlists',
  'Feature: OWASP A02 email unsubscribe data minimization

  Scenario: Email unsubscribe token lookup avoids wildcard projections
    Given a recipient opens an unsubscribe link
    When the unsubscribe function validates the token
    Then token lookup uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Token update returns only required fields
    Given a recipient confirms unsubscribe
    When the token is atomically marked used
    Then only the email and used timestamp are returned
    And unrelated token metadata is not over-fetched',
  'implemented',
  'unit',
  'supabase/functions/handle-email-unsubscribe/security_test.ts',
  'Covers OWASP A02 data minimization for the public token-bound unsubscribe endpoint.'
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
