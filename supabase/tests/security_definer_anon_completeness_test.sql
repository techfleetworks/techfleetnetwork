-- pgTAP: SECURITY DEFINER anon-exposure COMPLETENESS guard (DB-1 / re-audit RP-I).
--
-- security_definer_exposure_test.sql locks a HAND-PICKED set ("expand as the locked list grows").
-- That is the RH2 pattern: it proves 13 named functions are safe, not that EVERY SECURITY DEFINER
-- function is. Supabase's default privileges GRANT EXECUTE on new functions to `anon` (via PUBLIC), so a
-- function created without an explicit REVOKE is anon-callable — and a logged-out visitor should never be
-- able to invoke a privileged DEFINER function. This test proves COMPLETENESS: it enumerates every public
-- SECURITY DEFINER function from the catalog and asserts NONE is anon-executable, except an explicit,
-- shrink-only grandfather allowlist (the known current exposures, each to be revoked and removed).
--
-- A NEW anon-exposed DEFINER function (not on the allowlist) fails this test — the hole is caught by
-- construction, not by someone remembering to add a line.
--
-- The grandfather is keyed by the FULL identity signature `name(argtypes)`, NOT bare name: grandfathering
-- one overload must not mask an exposed sibling overload (a real hole otherwise). The signature string is
-- exactly what the diag prints, so seeding from the CI output is copy-paste.
--
-- NOTE: no grant is changed here (no app-break risk). This measures + locks the invariant; the actual
-- REVOKEs for the grandfathered functions are the burndown (they need the call graph so a legitimate
-- authenticated RPC is not broken — see ADR 20261110-db1-anon-definer-completeness). This file runs in
-- the (currently informational, not a required check) db-test suite; db-test now also runs when
-- supabase/tests/ changes. Scope: schema `public`, role `anon` only (see the ADR limitations).
BEGIN;
SELECT plan(2);

-- Shrink-only grandfather: FULL signatures `name(argtypes)` of public SECURITY DEFINER functions
-- currently anon-EXECUTE — each an intentional public RPC (keep, with a reason) or a known exposure
-- awaiting a REVOKE (burn down). SEEDED FROM THE db-test CI RUN of this file (the diag below prints the
-- exact set). Growth is review-gated (adding a line is a visible diff a reviewer blocks); it may only
-- shrink. Seed example:  INSERT INTO _anon_definer_grandfather(sig) VALUES ('foo(text)'), ('bar(uuid)');
CREATE TEMP TABLE _anon_definer_grandfather (sig text PRIMARY KEY);
-- Seeded 2026-11-10 from the db-test CI run of this file (76 anon-exposed public SECURITY DEFINER
-- functions). This is the DB-1 burndown — remove each signature as its anon grant is revoked.
-- BATCH 1 (2026-11-10, migration 20261110210000): 18 TRIGGER functions revoked (anon EXECUTE removed via
-- REVOKE … FROM PUBLIC — safe because trigger functions are fired by the trigger as the table owner and
-- are not callable via RPC), so the list is now 58. Still to burn down: the rpc-callable admin mutations
-- (class-admin, gumroad, record_event, …) with per-caller role analysis; and some functions are KEPT as
-- intentional public RPCs (get_feature_flags, get_i18n_bundle, get_network_stats, member-distribution,
-- policy reads). Auth/sign-in/rate-limit functions are owned by the auth refactor, not this burndown.
INSERT INTO _anon_definer_grandfather(sig) VALUES
  ('_assert_class_editor(_class_id uuid)'),
  ('_learner_cohort_start(_class_id uuid, _user_id uuid)'),
  ('_upsert_kpi(p_date date, p_key text, p_value numeric, p_unit text, p_window text, p_num bigint, p_den bigint)'),
  ('admin_recompute_stats()'),
  ('attach_gumroad_sale(p_sale_id text, p_user_id uuid)'),
  ('can_read_class_module_file(_name text)'),
  ('can_write_class_module_file(_name text)'),
  ('check_rate_limit(p_identifier text, p_action text, p_max_attempts integer, p_window_minutes integer, p_block_minutes integer)'),
  ('chunk_stale_log_rate_limit()'),
  ('class_item_release(_item_id uuid, _user_id uuid, OUT released boolean, OUT available_at timestamp with time zone)'),
  ('community_events_staleness_check()'),
  ('delete_class_module_attachment(p_attachment_id uuid)'),
  ('delete_class_module_item(p_item_id uuid)'),
  ('delete_class_section(p_section_id uuid)'),
  ('fill_content_gaps_check_and_inc(p_cap integer)'),
  ('get_class_curriculum_for_learner(p_class_id uuid)'),
  ('get_course_completion_counts(_course_specs jsonb)'),
  ('get_current_policy(p_key text, p_language text)'),
  ('get_feature_flags()'),
  ('get_i18n_bundle(p_locale text, p_namespace text)'),
  ('get_member_continent_distribution()'),
  ('get_member_country_distribution()'),
  ('get_network_stats()'),
  ('get_stuck_pending_email_count(p_age_minutes integer)'),
  ('get_welcome_flow_completion_count()'),
  ('handoff_is_active_member(p_project_id uuid)'),
  ('has_role(_user_id uuid, _role app_role)'),
  ('is_class_learner(_class_id uuid, _user_id uuid)'),
  ('is_class_owner(_class_id uuid, _user_id uuid)'),
  ('is_enrolled_in_class(_class_id uuid, _user_id uuid)'),
  ('list_founding_discord_role_targets()'),
  ('mark_community_agreement_required(p_application_id uuid)'),
  ('mark_task_incomplete(p_phase journey_phase, p_task_id text)'),
  ('membership_health()'),
  ('peek_rate_limit(p_identifier text, p_action text, p_max_attempts integer, p_window_minutes integer, p_block_minutes integer)'),
  ('publish_class_curriculum(p_class_id uuid)'),
  ('publish_policy_version(p_key text, p_version text, p_language text, p_title text, p_summary text, p_body_md text, p_body_html text)'),
  ('record_event(p_sink text, p_kind text, p_actor uuid, p_payload jsonb, p_severity text, p_ref_table text, p_ref_id text)'),
  ('record_failed_login(_email text, _ip text, _user_agent text)'),
  ('record_login_event(p_attempt_id uuid, p_outcome text, p_branch text, p_http_status integer, p_duration_ms integer, p_email text, p_ip text, p_user_agent text, p_origin_host text, p_request_id text, p_user_id uuid)'),
  ('record_policy_ack(p_policy_keys text[], p_version text, p_method text, p_ip inet, p_user_agent text, p_electronic_comms boolean, p_anon_id text)'),
  ('record_rate_limit_failure(p_identifier text, p_action text, p_max_attempts integer, p_window_minutes integer, p_block_minutes integer)'),
  ('register_class_module_file(p_item_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint)'),
  ('reorder_class_module_items(p_section_id uuid, p_ordered_ids uuid[])'),
  ('reorder_class_sections(p_class_id uuid, p_ordered_ids uuid[])'),
  ('report_founding_discord_role_gap()'),
  ('resolve_gumroad_user(p_email text)'),
  ('set_class_release_policy(p_class_id uuid, p_policy class_release_policy, p_release_at timestamp with time zone, p_offset_days integer)'),
  ('sign_community_agreement(p_application_id uuid, p_user_agent text)'),
  ('toggle_class_module_completion(p_item_id uuid, p_completed boolean)'),
  ('trg_fn_profiles_provision_customer()'),
  ('trg_fn_user_roles_provision_admin()'),
  ('trg_general_app_submitted()'),
  ('upsert_class_module_item(p_section_id uuid, p_item_id uuid, p_title text, p_content_html text, p_video_url text, p_action_type class_module_action_type, p_duration_minutes integer, p_required boolean, p_status class_module_status)'),
  ('upsert_class_module_link(p_item_id uuid, p_attachment_id uuid, p_url text, p_label text)'),
  ('upsert_class_section(p_class_id uuid, p_section_id uuid, p_title text, p_summary text, p_status class_module_status)'),
  ('use_invitation(p_token text)'),
  ('validate_invitation(p_token text)');

-- The exposed-signature expression, reused by the diag and both assertions.
-- sig = proname || '(' || identity-argtypes || ')'  e.g.  decrypt_pii(text)

-- Diagnostic: the exact exposed set outside the grandfather (so it can be seeded / burned down from CI).
SELECT diag(
  'public SECURITY DEFINER functions anon-EXECUTE outside the grandfather: ' ||
  COALESCE(string_agg(DISTINCT sig, ', ' ORDER BY sig), '(none)')
)
FROM (
  SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
) s
WHERE s.sig NOT IN (SELECT sig FROM _anon_definer_grandfather);

-- 1. COMPLETENESS: no public SECURITY DEFINER function is anon-executable outside the grandfather.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
   ) s
   WHERE s.sig NOT IN (SELECT sig FROM _anon_definer_grandfather)),
  0,
  'no public SECURITY DEFINER function is anon-executable outside the explicit grandfather (DB-1)'
);

-- 2. SHRINK-ONLY hygiene: every grandfather signature is still a real public SECURITY DEFINER function
--    that is still anon-exposed (a stale entry — removed, renamed, or already revoked — must be pruned).
SELECT is(
  (SELECT count(*)::int FROM _anon_definer_grandfather g
    WHERE g.sig NOT IN (
      SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'EXECUTE'))),
  0,
  'no stale grandfather entry (each still exists, is SECURITY DEFINER, and is still anon-exposed)'
);

SELECT * FROM finish();
ROLLBACK;
