-- OWASP A01/A05 hardening: remove direct anonymous execution from internal helper functions.
-- Trigger functions continue to run through their owning triggers; callers do not need direct EXECUTE privileges.

REVOKE EXECUTE ON FUNCTION public.audit_log_set_fingerprint() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_error_fingerprint(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redact_sensitive_text(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_user_html(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_block_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_hash_chain() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_hash_admin_promotion_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sanitize_announcement_html() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sanitize_banner_html() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sanitize_notification_html() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.audit_log_set_fingerprint() TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_error_fingerprint(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redact_sensitive_text(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sanitize_user_html(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_block_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_hash_chain() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_hash_admin_promotion_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sanitize_announcement_html() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sanitize_banner_html() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sanitize_notification_html() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

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
  'SEC-RPC-LEAST-PRIVILEGE-005',
  'Security hardening',
  90,
  'Internal trigger and sanitizer helpers are not directly callable by anonymous users',
  'Feature: Internal database helper least privilege\n  Scenario: Anonymous users cannot directly execute trigger or sanitization helper functions\n    Given internal database helpers protect audit integrity, timestamps, and HTML safety\n    When an unauthenticated visitor attempts to execute those helpers directly\n    Then the database denies direct execution\n    And normal trigger-based sanitization and audit behavior remains available through approved data changes',
  'implemented',
  'manual',
  'supabase/migrations/current_internal_helper_least_privilege.sql',
  'OWASP A01/A05 regression guard for direct execution of internal trigger and sanitization helpers.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();