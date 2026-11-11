-- RP-I / DB-1 burndown — batch 2: revoke anon EXECUTE on rpc-callable admin/authenticated mutations.
--
-- Batch 1 (migration 20261110210000) revoked the 18 TRIGGER functions (caller-safe — no role needs
-- direct EXECUTE on a trigger function). This batch handles the rpc-callable mutations: functions that
-- a real role DOES call via PostgREST, so each needed per-caller role analysis before a revoke, to prove
-- `anon` is never a legitimate caller and that the role(s) that ARE legitimate keep EXECUTE.
--
-- MECHANISM (from batch 1): in this Supabase project every `public` function is granted EXECUTE directly
-- to `anon`, `authenticated`, and `service_role` (the stack's default privilege), AND to PUBLIC. To remove
-- `anon` we revoke FROM anon, PUBLIC (both): `FROM anon` drops anon's direct grant, `, PUBLIC` drops the
-- PUBLIC path anon also inherits. `authenticated` and `service_role` keep their OWN direct grants, so they
-- are unaffected — PROVEN below by the fail-closed self-check, not assumed.
--
-- WHY A SELF-CHECK (batch 2 has a risk batch 1 did not): the completeness test
-- (security_definer_anon_completeness_test.sql) only asserts the `anon` dimension. If `, PUBLIC` had
-- stripped a legitimate caller because that role lacked a direct grant, the completeness test would stay
-- green while a real RPC broke in prod. The DO block at the end asserts the intended caller role still has
-- EXECUTE on every function here and ABORTS the migration (transaction rollback) otherwise — so a wrong
-- role attribution or an unexpected grant topology fails the apply instead of silently breaking a caller.
--
-- PER-CALLER EVIDENCE (observed, 2026-11-10, on this branch):
--   * Class-curriculum admin CRUD (12) — called from src/features/class-curriculum/services/
--     classCurriculum.service.ts via the browser client = the AUTHENTICATED class-editor; never from any
--     anon/logged-out path, never from an edge function. Each re-checks editor rights internally
--     (_assert_class_editor). Caller role = authenticated.
--   * sign_community_agreement — src/components/agreements/CommunityAgreementSheet.tsx (authenticated
--     member with an application). publish_policy_version — src/pages/admin/AdminPoliciesPage.tsx (admin).
--     mark_task_incomplete — src/services/journey.service.ts (authenticated learner). Caller role = authenticated.
--   * resolve_gumroad_user — called only from edge functions (gumroad-webhook, gumroad-backfill-all)
--     with the service-role client. list_founding_discord_role_targets, report_founding_discord_role_gap —
--     founding-discord-role edge (service-role). mark_community_agreement_required —
--     notify-applicant-status / send-community-agreement-trigger edges (service-role). Caller = service_role.
--   * attach_gumroad_sale — BOTH: the gumroad edges call it as service_role, AND it is intentionally
--     member-admin-callable as `authenticated` (GRANT … TO authenticated, service_role in
--     20260803120000_membership_ledger_projection.sql:483; "intentionally member-callable surface" in
--     20260810110000_lockdown_membership_internal_functions.sql; membership_ledger_test.sql proves an
--     authenticated non-admin gets 42501, i.e. it runs under authenticated and an admin passes;
--     ADR-0038 keeps admin attach_gumroad_sale as the per-sale fallback). The self-check asserts BOTH
--     authenticated and service_role retain EXECUTE for it.
--   None of the service/gumroad set is reachable by anon. (Most of the 15 authenticated fns above are also
--   granted service_role; the self-check asserts the role whose loss would actually break an interactive
--   caller — authenticated — plus service_role wherever service_role is the/an intended caller.)
--
-- Safe for expand/contract (ADR-0026): authenticated/service_role keep EXECUTE, so no running code path
-- breaks mid-deploy; anon never called these. Reversible by re-GRANT. Idempotent: re-revoke is a no-op.
--
-- NOT in this batch (deliberately):
--   * Auth / sign-in / rate-limit / signup-provisioning (check_rate_limit, peek_rate_limit,
--     record_rate_limit_failure, chunk_stale_log_rate_limit, record_failed_login, record_login_event,
--     use_invitation, record_event, trg_fn_profiles_provision_customer, trg_fn_user_roles_provision_admin)
--     — owned by the auth refactor (owner's call).
--   * Stats/KPI/health (admin_recompute_stats, _upsert_kpi, membership_health) — out of scope (owner's call).
--   * Intentional public RPCs that anon LEGITIMATELY calls — get_feature_flags, get_i18n_bundle,
--     get_network_stats, get_member_continent_distribution, get_member_country_distribution,
--     get_course_completion_counts, get_welcome_flow_completion_count, get_current_policy, record_policy_ack,
--     validate_invitation — these STAY granted to anon.
--   * SECURITY DEFINER helpers used INSIDE RLS policies (has_role, is_class_learner, is_class_owner,
--     is_enrolled_in_class, _assert_class_editor, _learner_cohort_start, can_read_class_module_file,
--     can_write_class_module_file, handoff_is_active_member) — revoking anon EXECUTE on these could turn an
--     anon table-read whose policy references them into a hard "permission denied for function" error.
--     Deferred to a batch that first proves no anon-visible table's RLS policy calls them.
--   * Ops/monitoring + other rpc fns needing more analysis (get_stuck_pending_email_count,
--     community_events_staleness_check, fill_content_gaps_check_and_inc, class_item_release,
--     get_class_curriculum_for_learner) and the missed trigger trg_general_app_submitted — later batches.

-- ── Authenticated-called admin/learner mutations (authenticated keeps its direct grant) ──
REVOKE EXECUTE ON FUNCTION public.upsert_class_section(uuid, uuid, text, text, class_module_status) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_class_section(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_class_module_item(uuid, uuid, text, text, text, class_module_action_type, integer, boolean, class_module_status) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_class_module_item(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_class_sections(uuid, uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_class_module_items(uuid, uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_class_curriculum(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_class_module_completion(uuid, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_class_release_policy(uuid, class_release_policy, timestamp with time zone, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_class_module_link(uuid, uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_class_module_file(uuid, text, text, text, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_class_module_attachment(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sign_community_agreement(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_policy_version(text, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_task_incomplete(journey_phase, text) FROM anon, PUBLIC;

-- ── Service-role-called mutations (service_role keeps its direct grant; edge functions call these) ──
REVOKE EXECUTE ON FUNCTION public.resolve_gumroad_user(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.attach_gumroad_sale(text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_founding_discord_role_targets() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_founding_discord_role_gap() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_community_agreement_required(uuid) FROM anon, PUBLIC;

-- ── Fail-closed self-check: the intended caller role MUST still hold EXECUTE after the revoke, or abort. ──
-- Proves `, PUBLIC` did not strip a legitimate caller (the completeness test only checks anon), and that
-- every signature above still resolves (catches drift). Read-only; idempotent.
DO $$
DECLARE
  rec record;
  broken text := '';
  fn_oid oid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('public.upsert_class_section(uuid, uuid, text, text, class_module_status)', 'authenticated'),
      ('public.delete_class_section(uuid)', 'authenticated'),
      ('public.upsert_class_module_item(uuid, uuid, text, text, text, class_module_action_type, integer, boolean, class_module_status)', 'authenticated'),
      ('public.delete_class_module_item(uuid)', 'authenticated'),
      ('public.reorder_class_sections(uuid, uuid[])', 'authenticated'),
      ('public.reorder_class_module_items(uuid, uuid[])', 'authenticated'),
      ('public.publish_class_curriculum(uuid)', 'authenticated'),
      ('public.toggle_class_module_completion(uuid, boolean)', 'authenticated'),
      ('public.set_class_release_policy(uuid, class_release_policy, timestamp with time zone, integer)', 'authenticated'),
      ('public.upsert_class_module_link(uuid, uuid, text, text)', 'authenticated'),
      ('public.register_class_module_file(uuid, text, text, text, bigint)', 'authenticated'),
      ('public.delete_class_module_attachment(uuid)', 'authenticated'),
      ('public.sign_community_agreement(uuid, text)', 'authenticated'),
      ('public.publish_policy_version(text, text, text, text, text, text, text)', 'authenticated'),
      ('public.mark_task_incomplete(journey_phase, text)', 'authenticated'),
      ('public.resolve_gumroad_user(text)', 'service_role'),
      ('public.attach_gumroad_sale(text, uuid)', 'service_role'),
      ('public.attach_gumroad_sale(text, uuid)', 'authenticated'),  -- also member-admin-callable (ADR-0038)
      ('public.list_founding_discord_role_targets()', 'service_role'),
      ('public.report_founding_discord_role_gap()', 'service_role'),
      ('public.mark_community_agreement_required(uuid)', 'service_role')
    ) AS t(sig, role_name)
  LOOP
    fn_oid := to_regprocedure(rec.sig);
    IF fn_oid IS NULL THEN
      RAISE EXCEPTION 'batch-2 self-check: function % did not resolve (signature drift) — aborting', rec.sig;
    END IF;
    IF NOT has_function_privilege(rec.role_name, fn_oid, 'EXECUTE') THEN
      broken := broken || rec.sig || ' (lost ' || rec.role_name || '); ';
    END IF;
  END LOOP;
  IF broken <> '' THEN
    RAISE EXCEPTION 'batch-2 revoke stripped a legitimate caller role (the , PUBLIC side-effect): % — aborting', broken;
  END IF;
END $$;
