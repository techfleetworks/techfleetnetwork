-- OWASP A01 Broken Access Control: remove direct app-user access from backend-only security helpers.
-- These helpers are intended to be invoked internally by trusted backend logic, not directly by browsers.

REVOKE EXECUTE ON FUNCTION public.is_elevated(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_elevated(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_elevated(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_elevated(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_remediation_allowed(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_remediation_allowed(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_remediation_allowed(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_remediation_allowed(text) TO service_role;

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
  'SEC-INTERNAL-HELPERS-011',
  'Security: OWASP RPC Access Control',
  11,
  'Backend-only security helpers cannot be executed directly by app users',
  'Feature: OWASP A01 backend helper access control
  As a platform security reviewer
  I want internal authorization helpers to be callable only by trusted backend automation
  So that browser clients cannot enumerate elevated-role or remediation allowlist behavior

  Scenario: Signed-in users cannot call backend-only helper RPCs directly
    Given a signed-in non-service user
    When the user attempts to execute is_elevated directly
    Then the database denies execution before helper logic runs
    When the user attempts to execute is_remediation_allowed directly
    Then the database denies execution before helper logic runs

  Scenario: Trusted backend automation can still use internal helper RPCs
    Given a trusted backend process using the service role
    When the process calls is_elevated for role-gated automation
    Then the helper returns only the expected boolean result
    When the process calls is_remediation_allowed for an allowlisted remediation
    Then the helper returns only the expected boolean result',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/migrations/2026042914_internal_helper_access_control.sql',
  'Covers OWASP A01 reduction of SECURITY DEFINER helper exposure for backend-only authorization and remediation checks.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();