-- Right-to-erasure completeness — the DEFINITIVE handle_user_deletion() (audit H9 + Wave-4 DSAR).
--
-- WHY: two erasure migrations landed at conflicting apply-order positions and clobbered each other.
--   * 20260810130001_h9_complete_erasure_cascade  adds de-identification/erasure for four PII-orphan
--     tables (gumroad_sales, cookie_consents, support_provisioning_log, support_ticket_events).
--   * 20260812180000_handoff_dsar_retention  CREATE-OR-REPLACE'd the whole function from the *pre-h9*
--     state ("every existing cleanup preserved verbatim") and added the hand-off deliverable block.
-- h9 is back-dated (Aug 10) but merged AFTER handoff_dsar (Aug 12), so on a fresh `db reset`
-- handoff_dsar wins and h9's cookie_consents + support-log erasure silently vanish — a LIVE
-- right-to-erasure gap: a deleted user's PII orphans in three tables and gumroad_sales.resolved_user_id
-- is never nulled. (h9_erasure_cascade_test proved it: 4/6 failing.)
--
-- THIS migration is the single source of truth: the UNION of both functions, applied last so it wins
-- regardless of the earlier ordering. gumroad de-identification is reconciled to the value the
-- gdpr_erasure_email_gumroad_test asserts ('erased@gdpr.invalid' + raw_payload '{}') PLUS h9's
-- resolved_user_id NULL. Every PII-orphan table is to_regclass-guarded (a renamed/dropped table can
-- never abort the cascade) and the whole thing is idempotent.
--
-- STRUCTURALLY GUARDED so this can never regress again: scripts/ci/check-erasure-completeness.mjs
-- fails CI if the latest handle_user_deletion definition drops any registered PII table, and
-- supabase/tests/h9_erasure_cascade_test.sql proves the behavior. See ADR-0039.

CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM set_config('app.erasing_auth_user', OLD.id::text, true);

  -- ── Base cascade: hard-delete the user's owned rows (no FK cascade) ──────────
  DELETE FROM public.user_quest_selections WHERE user_id = OLD.id;
  DELETE FROM public.push_subscriptions WHERE user_id = OLD.id;
  DELETE FROM public.chat_messages WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = OLD.id
  );
  DELETE FROM public.chat_conversations WHERE user_id = OLD.id;
  DELETE FROM public.journey_progress WHERE user_id = OLD.id;
  DELETE FROM public.announcement_reads WHERE user_id = OLD.id;
  DELETE FROM public.dashboard_preferences WHERE user_id = OLD.id;
  DELETE FROM public.grid_view_states WHERE user_id = OLD.id;
  DELETE FROM public.project_applications WHERE user_id = OLD.id;
  DELETE FROM public.general_applications WHERE user_id = OLD.id;
  DELETE FROM public.admin_promotions WHERE user_id = OLD.id;
  DELETE FROM public.user_roles WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.feedback WHERE user_id = OLD.id;

  IF OLD.email IS NOT NULL THEN
    DELETE FROM public.email_send_log WHERE lower(recipient_email) = lower(OLD.email);
  END IF;

  -- ── Financial ledger: RETAIN the transaction, de-identify it (H9 + gdpr test) ─
  IF to_regclass('public.gumroad_sales') IS NOT NULL THEN
    UPDATE public.gumroad_sales
       SET email = 'erased@gdpr.invalid',
           raw_payload = '{}'::jsonb,
           resolved_user_id = NULL
     WHERE resolved_user_id = OLD.id
        OR (OLD.email IS NOT NULL AND lower(email) = lower(OLD.email));
  END IF;

  -- ── Consent record: RETAIN proof-of-consent, drop the identifiers (H9) ───────
  IF to_regclass('public.cookie_consents') IS NOT NULL THEN
    UPDATE public.cookie_consents
       SET user_id = NULL, user_agent = NULL, ip_country = NULL
     WHERE user_id = OLD.id;
  END IF;

  -- ── Append-only operational logs: delete the user's rows, bypassing the
  --    append-only guard for JUST this erase (transactional → auto-reverts) (H9) ─
  IF to_regclass('public.support_provisioning_log') IS NOT NULL THEN
    ALTER TABLE public.support_provisioning_log DISABLE TRIGGER trg_support_prov_log_no_update;
    DELETE FROM public.support_provisioning_log WHERE user_id = OLD.id;
    ALTER TABLE public.support_provisioning_log ENABLE TRIGGER trg_support_prov_log_no_update;
  END IF;
  IF to_regclass('public.support_ticket_events') IS NOT NULL THEN
    ALTER TABLE public.support_ticket_events DISABLE TRIGGER trg_support_ticket_events_no_update;
    DELETE FROM public.support_ticket_events WHERE customer_user_id = OLD.id;
    ALTER TABLE public.support_ticket_events ENABLE TRIGGER trg_support_ticket_events_no_update;
  END IF;

  -- ── Hand-off deliverable submissions: uploaded personal-data content. Best-effort
  --    remove the backing blobs first (a storage hiccup must NOT roll back erasure —
  --    surface via audit_log), then the rows (Wave-4 DSAR / handoff_dsar_retention) ─
  BEGIN
    DELETE FROM storage.objects
     WHERE bucket_id = 'handoff-deliverables'
       AND name IN (
         SELECT file_path FROM public.handoff_deliverable_submissions
         WHERE created_by = OLD.id AND file_path IS NOT NULL
       );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, error_message)
    VALUES ('handoff_blob_erase_failed', 'handoff_deliverable_submissions', OLD.id, SQLERRM);
  END;
  DELETE FROM public.handoff_deliverable_submissions WHERE created_by = OLD.id;

  -- audit_log intentionally retained for the SOC 2 hash-chain (append-only); redact-in-place
  -- is the admin-erasure path, never a hard delete here.
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;
