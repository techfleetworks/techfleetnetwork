-- ============================================================================
-- 1) Storage: stop listing of the public `avatars` bucket
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated members can view avatars" ON storage.objects;

CREATE POLICY "Avatars are viewable by signed-in users (no list)"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name IS NOT NULL
    AND length(name) > 0
  );

-- ============================================================================
-- 2) Trigger-only SECURITY DEFINER functions: revoke EXECUTE from PUBLIC/anon/auth
--    Triggers fire regardless of grants. No app behavior changes.
-- ============================================================================
DO $$
DECLARE
  fname text;
  trigger_fns text[] := ARRAY[
    'audit_announcement','audit_class_certification','audit_client_changes',
    'audit_email_send_log','audit_general_application','audit_invitation',
    'audit_journey_progress','audit_log_drop_dead_sources','audit_profile_changes',
    'audit_project_application','audit_project_certification','audit_project_changes',
    'audit_project_roster','audit_public_table_change','audit_role_changes',
    'audit_session_revocation','audit_table_change_filtered',
    'block_non_actionable_fix_queue_inserts','block_skills_category_labels',
    'cascade_delete_auth_user_on_profile_delete','classes_set_slug',
    'classes_validate_transition','cohorts_validate',
    'enforce_audit_log_insert_context','enforce_profile_has_auth_user',
    'fleety_purge_cache_for_turn','handle_new_user','handle_teacher_role_revocation',
    'handle_user_deletion','notify_admin_login_event','notify_admin_on_audit_error',
    'notify_email_queue_worker','notify_feedback_submitted','notify_project_opening',
    'notify_push_on_insert','observer_role_optin_immutable_fields',
    'prevent_email_change','tg_bump_kb_version','tg_encrypt_pii_columns',
    'tg_encrypt_security_events_ip','tg_sync_reference_to_kb',
    'tg_sync_relationship_to_kb','trg_notify_class_status_change',
    'triage_audit_log_capture'
  ];
  fn_oid oid;
BEGIN
  FOREACH fname IN ARRAY trigger_fns LOOP
    FOR fn_oid IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fname
    LOOP
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        fn_oid::regprocedure
      );
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 3) Revoke anon EXECUTE from every SECURITY DEFINER function in public,
--    then re-grant ONLY the small set that genuinely needs pre-auth access.
-- ============================================================================
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
  END LOOP;
END $$;

-- Pre-auth / public-stats RPCs that must remain anon-callable
DO $$
DECLARE
  fname text;
  keep_anon text[] := ARRAY[
    'check_rate_limit','peek_rate_limit','record_rate_limit_failure',
    'record_failed_login','validate_invitation','use_invitation',
    'get_audit_policy','get_member_country_distribution','get_network_stats',
    'open_incident','request_human_review','submit_dispute',
    'record_sanctions_screening','record_policy_ack'
  ];
  fn_sig text;
BEGIN
  FOREACH fname IN ARRAY keep_anon LOOP
    FOR fn_sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fname
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn_sig);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 4) Revoke authenticated EXECUTE from server-side-only SECURITY DEFINER fns
--    (called only from edge functions via service_role, never from the client).
-- ============================================================================
DO $$
DECLARE
  fname text;
  server_only text[] := ARRAY[
    'fw_refresh_neighbors_mv','fw_refresh_search_mv','fw_sync_relationships_to_kb',
    'fleety_approve_relationship','fleety_record_action',
    'evaluate_system_health','get_top_silent_failures',
    'get_email_pipeline_health','get_community_events_health',
    'get_announcement_view_counts','get_course_completion_counts',
    'get_node_neighbors','get_nodes_neighbors_batch','get_milestone_blueprint',
    'get_company_type_context','get_deliverable_context','get_stakeholder_context',
    'fw_lookup_relationships','fleety_few_shot_examples','fleety_top_expensive_turns',
    'fleety_cost_projection','fleety_match_examples','fleety_match_examples_semantic',
    'fleety_match_playbooks','fleety_match_playbooks_semantic',
    'fleety_playbooks_by_intent','fleety_kb_semantic_search',
    'web_vitals_p75','web_vitals_trend','write_audit_log',
    'set_fix_queue_status','snooze_fix_queue_entry','upsert_fix_queue_entry',
    'promote_fingerprint_to_known','submit_dsar','count_classes_pending_review',
    'approve_and_publish_class','archive_class','cancel_cohort'
  ];
  fn_sig text;
BEGIN
  FOREACH fname IN ARRAY server_only LOOP
    FOR fn_sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fname
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn_sig);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', fn_sig);
    END LOOP;
  END LOOP;
END $$;