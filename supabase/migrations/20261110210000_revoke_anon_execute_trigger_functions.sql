-- RP-I / DB-1 burndown — batch 1: revoke EXECUTE on trigger functions.
--
-- The security_definer_anon_completeness_test.sql gate (ADR 20261110-db1-anon-definer-completeness)
-- recorded 76 public SECURITY DEFINER functions anon-EXECUTE by default. This revokes the 18 that are
-- TRIGGER functions (RETURNS trigger): they are invoked by the trigger mechanism as the table owner and
-- are NOT callable via PostgREST RPC, so NO role needs direct EXECUTE on them — revoking is caller-safe
-- (it cannot break a logged-in user, an edge function, or a trigger firing).
--
-- We revoke FROM anon, PUBLIC (both), because in this Supabase project `anon` holds a DIRECT role grant on
-- functions (the stack's default privilege), not merely access via PUBLIC. Proof: trg_gumroad_sales_purchase_email
-- and trg_email_alias_resolve_pending already carry `REVOKE ALL ... FROM PUBLIC` in their creating migrations,
-- yet the db-test run still listed them as anon-exposed — so `FROM PUBLIC` alone is a no-op for the direct
-- anon grant (matching the repo's existing `REVOKE EXECUTE ... FROM anon` precedent, e.g. check_rate_limit).
-- `FROM anon` removes the direct grant; `, PUBLIC` also clears any PUBLIC path; `authenticated` is untouched
-- (and triggers need no direct EXECUTE anyway). The db-test completeness assertion proves on CI that each is
-- no longer anon-exposed (grandfather shrinks 76 -> 58); if a revoke were ineffective, it reds.
--
-- Safe for expand/contract (ADR-0026): a REVOKE on a trigger function breaks no running code mid-deploy
-- (nothing calls these directly). Reversible by re-GRANT. Idempotent: revoking an absent grant is a no-op.
--
-- NOT in this batch (deliberately): auth/sign-in/rate-limit functions (owned by the auth refactor),
-- stats/KPI functions (out of scope), intentional public RPCs (get_feature_flags, get_i18n_bundle,
-- get_network_stats, member-distribution stats, policy reads), and the rpc-callable admin mutations
-- (class-admin, gumroad, record_event, …) which need per-caller role analysis — a reviewed batch 2.

REVOKE EXECUTE ON FUNCTION public.fn_emit_application_badge() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_application_confirmation() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_evaluate_course_completion_trg() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recompute_phase_definitions() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.general_applications_protect_completed_status() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.project_applications_protect_completed_status() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.journey_progress_block_silent_uncomplete() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.journey_progress_guard_uncomplete() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_journey_progress_complete() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_gumroad_sales_purchase_email() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_email_outbox_terminal_to_send_log() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_email_alias_resolve_pending() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_project_application_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_refactor_kpi_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mirror_community_agreement_signed_at() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respect_notification_prefs() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_discord_linked_at() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eo_enqueue_contact_delete_on_user_deletion() FROM anon, PUBLIC;
