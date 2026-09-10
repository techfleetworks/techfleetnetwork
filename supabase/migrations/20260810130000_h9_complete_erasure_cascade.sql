-- Audit H9 (right-to-erasure completeness). `handle_user_deletion()` (BEFORE
-- DELETE ON auth.users) erases a hardcoded 15-table list, and ~20 more tables
-- clean up via ON DELETE CASCADE. But four tables carry user PII with NEITHER an
-- auth FK cascade NOR a line in the function, so they ORPHAN personal data after
-- an account is deleted:
--   * gumroad_sales.email / resolved_user_id      (financial ledger)
--   * cookie_consents.user_id / user_agent / ip_country (consent record)
--   * support_provisioning_log.user_id            (append-only operational log)
--   * support_ticket_events.customer_user_id      (append-only operational log)
--
-- Policy defaults applied here (flagged for owner review — see PR):
--   * gumroad_sales: RETAIN the row (financial/tax record likely under a legal
--     retention obligation) but DE-IDENTIFY — null the user link + redact email.
--   * cookie_consents: RETAIN as proof-of-consent (GDPR accountability) but
--     DE-IDENTIFY — null user_id + the request metadata (user_agent, ip_country).
--   * support_*_log: DELETE the user's operational rows. These are append-only,
--     so disable the block trigger around ONLY this erase (transactional: rolls
--     back on error), mirroring support_prune_webhook_events.
--
-- to_regclass-guarded per table so a renamed/dropped table can never abort the
-- whole cascade. Idempotent (re-running finds nothing to erase). audit_log and
-- the other tamper-evident tables are intentionally left to the redact-in-place
-- path (a later admin-erasure PR), never hard-deleted here.

CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
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

  -- ── H9: erase/de-identify the PII orphans (no FK cascade, not above) ─────────
  -- Financial ledger: keep the transaction, drop the person link + email.
  IF to_regclass('public.gumroad_sales') IS NOT NULL THEN
    UPDATE public.gumroad_sales
       SET email = 'redacted@deleted.invalid',
           resolved_user_id = NULL
     WHERE resolved_user_id = OLD.id
        OR (OLD.email IS NOT NULL AND lower(email) = lower(OLD.email));
  END IF;

  -- Consent record: keep proof-of-consent, drop the identifiers.
  IF to_regclass('public.cookie_consents') IS NOT NULL THEN
    UPDATE public.cookie_consents
       SET user_id = NULL, user_agent = NULL, ip_country = NULL
     WHERE user_id = OLD.id;
  END IF;

  -- Append-only operational logs: delete the user's rows, bypassing the
  -- append-only guard for just this erase (DDL is transactional → auto-reverts).
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

  -- audit_log intentionally retained for SOC 2 hash-chain (append-only);
  -- redact-in-place is handled by the admin-erasure path, not here.
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;
