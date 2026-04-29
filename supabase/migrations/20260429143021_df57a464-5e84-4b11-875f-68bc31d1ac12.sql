-- OWASP A01 Broken Access Control: backend-only admin system health helpers.
-- Browser clients must use the JWT-validated admin-system-health backend function.

REVOKE EXECUTE ON FUNCTION public.evaluate_system_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_system_health() FROM anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_system_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_system_health() TO service_role;

REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_auto_remediations() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) TO service_role;

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
  'SEC-ADMIN-SYSTEM-HEALTH-014',
  'Security: OWASP Admin System Health Access',
  14,
  'System health remediation helpers are backend-only',
  'Feature: OWASP A01 admin system health access control
  As a platform security reviewer
  I want system health remediation helpers callable only by trusted backend code
  So that signed-in browser users cannot directly execute elevated operational RPCs

  Scenario: Non-admin users cannot access system health actions
    Given a signed-in non-admin user
    When the user invokes the admin system health backend function
    Then the request is rejected as forbidden

  Scenario: Admin users access health actions through a validated backend function
    Given a signed-in admin user
    When the admin requests email pipeline health
    Then the backend validates the JWT and admin role before returning bounded health data
    When the admin runs automatic remediations
    Then the backend validates the JWT and admin role before invoking backend-only remediation helpers

  Scenario: Browser users cannot directly call backend-only remediation RPCs
    Given any signed-in browser user
    When the user attempts to execute evaluate_system_health, get_email_pipeline_health, or run_auto_remediations directly
    Then the database denies execution before helper logic runs',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/functions/admin-system-health/index.ts; supabase/migrations/2026042914_admin_system_health_backend_only.sql',
  'Covers OWASP A01 reduction of direct SECURITY DEFINER exposure for admin operational helpers.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();