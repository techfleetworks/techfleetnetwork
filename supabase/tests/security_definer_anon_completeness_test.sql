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
-- BATCH 1 (2026-11-10, migration 20261110210000): 18 TRIGGER functions revoked (caller-safe), 76 -> 58.
-- BATCH 2 (2026-11-10, migration 20261110220000): 20 rpc-callable admin/authenticated mutations revoked
--   FROM anon, PUBLIC after per-caller role analysis (class-curriculum admin CRUD + sign_community_agreement
--   + publish_policy_version + mark_task_incomplete kept for `authenticated`; gumroad/discord/
--   mark_community_agreement_required kept for `service_role`), 58 -> 38. The migration self-checks that the
--   intended role retained EXECUTE.
-- BATCH 3 (2026-11-10, migration 20261110230000): 8 SECURITY DEFINER RLS-helper functions revoked FROM anon,
--   PUBLIC after proving every policy that references them is `TO authenticated` (none anon/public) — the 6
--   policy-helpers (is_class_owner, is_enrolled_in_class, is_class_learner, can_read/write_class_module_file,
--   handoff_is_active_member) plus the 2 nested-only helpers (_assert_class_editor, _learner_cohort_start, in
--   no policy, PERFORMed as definer). The migration self-checks (a) authenticated retains EXECUTE and (b) NO
--   anon/public policy references any of the 8 — the latter reads the live catalog at apply, so a hidden prod
--   policy aborts the apply. 38 -> 30.
-- BATCH 4 (2026-11-10, migration 20261111000000): NO grant change — the prerequisite for the has_role revoke.
--   The has_role anon-policy audit (deferred by batch 3) found 9 LIVE RLS policies that call has_role and had
--   NO `TO` clause (so they defaulted to PUBLIC/anon): policy_versions "admin write", policy_acknowledgments
--   "ack self read", recording_consents "rec self read", sanctions_screenings "sanctions admin read",
--   dispute_intake "admin read"/"admin update", dpa_executions "dpa admin all", observer_role_optins "Admins
--   can view all observer opt-ins", lesson_video_events "lve self or admin read". Batch 4 ALTERed all 9 to
--   `TO authenticated` (behavior-preserving: anon never matched them — auth.uid() NULL). After batch 4, NO
--   anon/public policy references has_role, so has_role IS now safe to revoke from anon — that is batch 5
--   (which removes has_role from this grandfather). Grandfather unchanged (still 30).
-- BATCH 5 (2026-11-10, migration 20261111010000): revoked anon EXECUTE on has_role(uuid, app_role) FROM anon,
--   PUBLIC (single overload; direct grants to authenticated @20260430021322 + service_role @20260708050000
--   are untouched). Safe because batch 4 removed every anon/public policy reference to has_role. THREE
--   fail-closed self-checks at prod apply: #1 authenticated+service_role retain EXECUTE; #2 NO anon/public
--   policy references has_role directly (live catalog); #3 NO anon-reachable SECURITY INVOKER function or
--   security_invoker view calls has_role (the transitive vector — closes the name-scan gap). 30 -> 29.
-- BATCH 6 (2026-11-11, migration 20261111020000): revoked anon EXECUTE FROM anon, PUBLIC on the last 6
--   burn-down-able fns after per-caller analysis found none is anon-called: get_stuck_pending_email_count
--   (authenticated+service_role), community_events_staleness_check (pg_cron/owner), fill_content_gaps_check_and_inc
--   (service_role), class_item_release (authenticated+service_role; RLS policies all TO authenticated),
--   get_class_curriculum_for_learner (authenticated+service_role), trg_general_app_submitted (trigger — not
--   RPC-callable). Self-checks: #1 the caller roles retain EXECUTE; #2 NO anon/public policy references any of
--   the 6 (live catalog, word-boundary match). 29 -> 23.
-- REMAINING (the 23 below) are NOT burn-down in this program — all intentional keeps or out of scope.
--   Intentional public RPCs (anon legitimately calls): get_feature_flags, get_i18n_bundle,
--   get_network_stats, get_member_*_distribution, get_course_completion_counts, get_welcome_flow_completion_count,
--   get_current_policy, record_policy_ack, validate_invitation. Auth/sign-in/rate-limit + use_invitation +
--   record_event + auth-provisioning triggers are owned by the auth refactor; stats/KPI (admin_recompute_stats,
--   _upsert_kpi, membership_health) are out of scope.
INSERT INTO _anon_definer_grandfather(sig) VALUES
  ('_upsert_kpi(p_date date, p_key text, p_value numeric, p_unit text, p_window text, p_num bigint, p_den bigint)'),
  ('admin_recompute_stats()'),
  ('check_rate_limit(p_identifier text, p_action text, p_max_attempts integer, p_window_minutes integer, p_block_minutes integer)'),
  ('chunk_stale_log_rate_limit()'),
  ('get_course_completion_counts(_course_specs jsonb)'),
  ('get_current_policy(p_key text, p_language text)'),
  ('get_feature_flags()'),
  ('get_i18n_bundle(p_locale text, p_namespace text)'),
  ('get_member_continent_distribution()'),
  ('get_member_country_distribution()'),
  ('get_network_stats()'),
  ('get_welcome_flow_completion_count()'),
  ('membership_health()'),
  ('peek_rate_limit(p_identifier text, p_action text, p_max_attempts integer, p_window_minutes integer, p_block_minutes integer)'),
  ('record_event(p_sink text, p_kind text, p_actor uuid, p_payload jsonb, p_severity text, p_ref_table text, p_ref_id text)'),
  ('record_failed_login(_email text, _ip text, _user_agent text)'),
  ('record_login_event(p_attempt_id uuid, p_outcome text, p_branch text, p_http_status integer, p_duration_ms integer, p_email text, p_ip text, p_user_agent text, p_origin_host text, p_request_id text, p_user_id uuid)'),
  ('record_policy_ack(p_policy_keys text[], p_version text, p_method text, p_ip inet, p_user_agent text, p_electronic_comms boolean, p_anon_id text)'),
  ('record_rate_limit_failure(p_identifier text, p_action text, p_max_attempts integer, p_window_minutes integer, p_block_minutes integer)'),
  ('trg_fn_profiles_provision_customer()'),
  ('trg_fn_user_roles_provision_admin()'),
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
