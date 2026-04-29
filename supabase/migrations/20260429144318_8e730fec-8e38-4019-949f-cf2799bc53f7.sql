-- OWASP A01 Broken Access Control: backend-only public auth helper RPCs.
-- Public clients must use validated backend functions; direct elevated database RPC access is removed.

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_invitation(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_invitation(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.use_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_invitation(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.use_invitation(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.use_invitation(text) TO service_role;

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
  'SEC-PREAUTH-BACKEND-017',
  'Security: OWASP Pre-Auth Helper Access',
  17,
  'Pre-authentication helpers are callable only through validated backend functions',
  'Feature: OWASP A01 and A03 pre-auth helper access control
  As a platform security reviewer
  I want public authentication helper actions mediated by validated backend functions
  So that anonymous clients cannot directly execute elevated database helpers

  Scenario: Rate limit checks use a validated backend function
    Given a visitor entering an authentication form
    When the client checks rate limits
    Then the backend validates the action and identifier before invoking backend-only rate limit storage

  Scenario: Failed login records use a validated backend function
    Given a failed login attempt
    When the client records the failed attempt
    Then the backend validates and bounds email, IP, and user-agent inputs before recording suspicious activity

  Scenario: Invitation actions use a validated backend function
    Given a visitor with an invitation token
    When the client validates or uses the invitation
    Then the backend validates token format before invoking backend-only invitation helpers

  Scenario: Direct pre-auth RPC execution is denied
    Given any browser client
    When the client attempts to execute check_rate_limit, record_failed_login, validate_invitation, or use_invitation directly
    Then the database denies execution before helper logic runs',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/functions/rate-limit/index.ts; supabase/functions/public-auth-helpers/index.ts; supabase/migrations/2026042914_preauth_backend_only.sql',
  'Covers OWASP A01/A03 reduction of direct SECURITY DEFINER exposure for pre-authentication helper RPCs.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();