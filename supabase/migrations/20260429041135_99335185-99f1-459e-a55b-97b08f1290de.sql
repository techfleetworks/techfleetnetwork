-- OWASP A01/A05 hardening: remove unnecessary public execution from SECURITY DEFINER RPCs.
-- Keep pre-authentication RPCs public only when the user flow requires it.

-- Functions used only after sign-in or by backend jobs should not be callable by anonymous users.
REVOKE EXECUTE ON FUNCTION public._consume_device_nonce(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._current_aal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_2fa_grace_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_2fa_grace_deadline(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_two_factor_login_artifacts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_system_health() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_announcement_view_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_member_country_distribution() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_own_promotions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_elevated(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_remediation_allowed(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_session_revoked(uuid, timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_trusted_device_active(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_two_factor_login_verified(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_device_binding_nonce(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_pii_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_two_factor_login_verified(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) FROM PUBLIC, anon;

-- Backend-only maintenance helpers.
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stuck_email_queue() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_two_factor_login_artifacts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_pii(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_pii(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- Re-grant explicit least-privilege access.
GRANT EXECUTE ON FUNCTION public._consume_device_nonce(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._current_aal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_2fa_grace_deadline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_system_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_announcement_view_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_email_pipeline_health(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_country_distribution() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_network_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_own_promotions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_elevated(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_remediation_allowed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_session_revoked(uuid, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trusted_device_active(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_two_factor_login_verified(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_device_binding_nonce(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_pii_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_two_factor_login_verified(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_auto_remediations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_email_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_two_factor_login_artifacts() TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_pii(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_pii(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

-- Preserve intentionally pre-authentication flows with explicit public grants.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.use_invitation(text) TO anon, authenticated, service_role;

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
  'SEC-RPC-LEAST-PRIVILEGE-004',
  'Security hardening',
  90,
  'Security definer helpers are least-privilege by default',
  'Feature: Backend function least privilege\n  Scenario: Anonymous users cannot call authenticated-only security helpers\n    Given backend helper functions run with elevated privileges\n    When an unauthenticated user attempts to call 2FA, audit, role, system-health, or queue maintenance helpers\n    Then execution is denied unless the helper is explicitly required before sign-in\n    And pre-authentication helpers remain limited to login throttling and invitation validation flows',
  'implemented',
  'manual',
  'supabase/migrations/current_security_rpc_least_privilege.sql',
  'OWASP A01/A05 regression guard for SECURITY DEFINER RPC grants.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();