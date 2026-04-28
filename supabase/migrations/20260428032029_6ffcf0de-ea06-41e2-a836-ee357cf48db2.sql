-- Security linter triage: revoke direct client execution from trigger-only helpers.
-- These functions are invoked by database triggers, not by browser clients.
REVOKE EXECUTE ON FUNCTION public.audit_announcement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_chat_conversation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_class_certification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_client_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_email_send_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_general_application() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_invitation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_journey_progress() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_profile_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_project_application() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_project_certification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_project_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_project_roster() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_public_table_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_role_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_session_revocation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_user_deletion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_login_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_on_audit_error() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_feedback_submitted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_project_opening() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_email_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_encrypt_pii_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_encrypt_security_events_ip() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_redact_audit_error() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_redact_outbox_error() FROM PUBLIC, anon, authenticated;

-- Security linter triage: backend-only operational helpers.
-- These are called by trusted backend functions/jobs and should not be directly callable by browser clients.
REVOKE EXECUTE ON FUNCTION public.check_chat_system_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_passkey_login_artifacts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stuck_email_queue() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_rate_limits_for_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.drain_notification_fanout_jobs(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.drain_notification_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_pii(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_pending_fanout_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_discord_role_grant_result(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_notification_fanout_chunk(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_discord_role_grant(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_pending_discord_role_grants() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_stuck_fanout_jobs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.safe_create_notification(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_email_visibility_timeout(text, bigint, integer) FROM PUBLIC, anon, authenticated;

-- Preserve trusted backend access for the operational helpers.
GRANT EXECUTE ON FUNCTION public.check_chat_system_rate_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_passkey_login_artifacts() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_email_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_rate_limits_for_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.drain_notification_fanout_jobs(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.drain_notification_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_pii(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_fanout_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_discord_role_grant_result(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_notification_fanout_chunk(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_discord_role_grant(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_rate_limit(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_pending_discord_role_grants() TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_stuck_fanout_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.safe_create_notification(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_email_visibility_timeout(text, bigint, integer) TO service_role;

-- Reduce unauthenticated exposure for signed-in-only client helpers while preserving member/admin workflows.
REVOKE EXECUTE ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_overview(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_member_country_distribution() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_passkey_login_verified(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_session_revoked(uuid, timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_trusted_device_active(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_pii_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_country_distribution() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_network_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_error_fingerprints(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_passkey_login_verified(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_session_revoked(uuid, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trusted_device_active(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_role_grants_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_pii_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_auto_remediations() TO authenticated, service_role;

-- BDD coverage for this stabilization/security hardening pass.
INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type, notes)
VALUES
(
  'Database Security Hardening',
  86,
  'DBSEC-086-001',
  'Trigger-only security-definer functions are not callable by app clients',
  'Feature: Database Security Hardening
  Scenario: A visitor or member tries to directly execute a trigger-only helper
    Given a database helper exists only for automatic trigger execution
    When an unauthenticated visitor or signed-in member attempts to call it directly
    Then the database denies direct execution
    And the original trigger still runs automatically during normal record changes',
  'implemented',
  'manual',
  'Covers revoking direct client execution from audit, notification, encryption, and lifecycle trigger helpers.'
),
(
  'Database Security Hardening',
  86,
  'DBSEC-086-002',
  'Backend-only operational helpers require trusted backend execution',
  'Feature: Database Security Hardening
  Scenario: Browser clients cannot invoke queue or maintenance helpers
    Given queue dispatch, fanout, Discord role retry, and maintenance helpers are backend-only operations
    When a visitor or signed-in member attempts to call those helpers directly
    Then the database denies direct execution
    And trusted backend jobs can still process email queues, notification fanout, and retry workflows',
  'implemented',
  'manual',
  'Covers backend-only helper permission tightening while retaining service execution.'
),
(
  'Database Security Hardening',
  86,
  'DBSEC-086-003',
  'User-facing helper functions keep required signed-in access only',
  'Feature: Database Security Hardening
  Scenario: Member helpers are not exposed to unauthenticated visitors
    Given a helper supports a signed-in user workflow such as dashboard data, passkey state, export, or admin health checks
    When an unauthenticated visitor attempts to call the helper
    Then the database denies direct execution
    And signed-in users retain access where the helper performs its own authorization checks',
  'implemented',
  'manual',
  'Covers low-risk revocation of anonymous execution while preserving active authenticated workflows.'
)
ON CONFLICT (scenario_id) DO UPDATE
SET title = EXCLUDED.title,
    gherkin = EXCLUDED.gherkin,
    status = EXCLUDED.status,
    test_type = EXCLUDED.test_type,
    notes = EXCLUDED.notes,
    updated_at = now();