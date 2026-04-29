-- OWASP A01 Broken Access Control: backend-only aggregate helpers.
-- Public UI reads aggregate network activity through the validated public-network-activity backend function.

REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_network_stats() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_member_country_distribution() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_member_country_distribution() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_member_country_distribution() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_country_distribution() TO service_role;

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
  'SEC-PUBLIC-AGGREGATES-016',
  'Security: OWASP Public Aggregate Access',
  16,
  'Public network activity aggregates are exposed only through a bounded backend function',
  'Feature: OWASP A01 public aggregate access control
  As a platform security reviewer
  I want public aggregate metrics served through a bounded backend function
  So that visitors can see approved counts without direct elevated database function access

  Scenario: Visitors can request approved network statistics
    Given any visitor
    When the visitor requests network activity statistics through the public backend function
    Then only aggregate network counts are returned
    And no profile-level records or sensitive fields are exposed

  Scenario: Visitors can request approved country distribution
    Given any visitor
    When the visitor requests member country distribution through the public backend function
    Then only country labels and aggregate counts are returned
    And no individual profile records are exposed

  Scenario: Browser clients cannot execute elevated aggregate RPCs directly
    Given any browser client
    When the client attempts to execute get_network_stats or get_member_country_distribution directly
    Then the database denies execution before aggregate helper logic runs',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/functions/public-network-activity/index.ts; supabase/migrations/2026042914_public_aggregate_backend_only.sql',
  'Covers OWASP A01 reduction of direct SECURITY DEFINER exposure for public aggregate network activity helpers.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();