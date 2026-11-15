-- PR6 (announcement broadcast resilience): the ROOT fix — take the enqueue out of the
-- per-row audit path, so it can never be slowed into the 8s wall again.
--
-- ROOT CAUSE (measured 2026-11-13): a full announcement enqueue took ~3.6s for ~2,283
-- recipients — ~1.6ms/row, which is NOT the inserts (a 2,283-row insert is milliseconds).
-- The cost is that the enqueue writes one `email_send_log` 'pending' MARKER per recipient,
-- and `trg_audit_email_send_log` fires on each INSERT → ~2,283 inserts into `audit_log`,
-- a tamper-evident APPEND-ONLY HASH CHAIN (built 2026-04-23, migration 20260423204012)
-- whose per-row triggers also encrypt + redact. The chain is serialized (each row hashes
-- the previous), so those ~2,283 appends run one-behind-another and contend with every
-- other audit write in the app. At ~3.6s in isolation it already sat <2.5x under the 8s
-- connection wall (statement_timeout / lock_timeout, both 8s on authenticator); growing
-- audit volume tipped it over, the statement was cancelled, and the whole enqueue rolled
-- back silently. PR1 (raise statement_timeout) and PR2 (chunk) only *accommodate* that
-- cost. This removes it.
--
-- FIX: do NOT audit the per-recipient bulk announcement 'pending' markers. They are pure
-- noise, not a compliance event — and they never captured the authorizing admin anyway:
-- they are inserted under the SECURITY DEFINER service-role enqueue, so their audit actor
-- (auth.uid()) was already NULL. The admin who authorized the send is recorded server-side
-- in `announcements.marketing_attested_by` / `marketing_attested_at` (columns set on send),
-- and announcement DELIVERY FAILURES are still audited by this function's UPDATE branch
-- (failed/dlq/bounced/complained), which is unchanged. Only the per-recipient 'email_queued'
-- marker is skipped. Every other lane (auth, transactional, …) is audited exactly as before.
-- (Consistent with decisions.md ADR-0021: high-volume signals go to an aggregate, never a
-- per-occurrence audit row.)
-- Honest note: there is no hash-chained audit_log record of a SUCCESSFUL broadcast's actor
-- today (the markers did not provide one); if tamper-evident per-send authorization is
-- wanted, that is a separate follow-up, not a regression introduced here.
--
-- Effect: the enqueue no longer appends to the serialized hash chain at all, so it is
-- immune to audit-chain contention — a structural fix (remove the cost), not a bigger
-- limit. Expected: the ~3.6s enqueue drops to sub-second (re-measure after applying).
--
-- Hash-chain integrity is unaffected: the chain validates the rows that ARE written;
-- writing fewer rows does not break `verify_audit_chain()`.
--
-- Expand (behaviour-preserving-except-the-skip CREATE OR REPLACE, same signature/trigger
-- binding), idempotent. Full body below is the current (20260605201145) definition with
-- ONLY the guard added. pgTAP: supabase/tests/email_send_log_audit_scope_test.sql.
-- ADR: docs/adr/20261113-skip-bulk-marker-audit.md.

CREATE OR REPLACE FUNCTION public.audit_email_send_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  resolved_event text;
  v_benign      boolean;
  v_is_reconciled_sent boolean;
  v_fields      text[];
  v_err         text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- ROOT FIX: skip the per-recipient bulk announcement enqueue markers. ~1 per
    -- recipient (thousands per send), each otherwise an append to the serialized
    -- hash-chained audit_log — the storm that pushed the enqueue past the 8s wall.
    -- These never captured the admin (service-role enqueue → auth.uid() NULL); the
    -- authorizing admin is in announcements.marketing_attested_by/at, and delivery
    -- failures are still audited by the UPDATE branch below. Noise, not compliance.
    IF NEW.template_name = 'announcement' AND NEW.status = 'pending' THEN
      RETURN NEW;
    END IF;

    v_is_reconciled_sent :=
      NEW.status = 'sent'
      AND NEW.error_message IS NOT NULL
      AND NEW.error_message LIKE 'Duplicate enqueue reconciled%';

    v_benign :=
      NEW.status IN ('reconciled','rate_limited','frequency_capped','suppressed')
      OR v_is_reconciled_sent;

    v_fields := ARRAY[
      COALESCE(NEW.template_name, ''),
      COALESCE(NEW.recipient_email, ''),
      COALESCE(NEW.status, '')
    ];
    IF v_benign THEN
      v_fields := v_fields || ARRAY['severity:info'];
      IF v_is_reconciled_sent THEN
        v_fields := v_fields || ARRAY['reconciled:duplicate_enqueue'];
      END IF;
      IF NEW.error_message IS NOT NULL THEN
        v_fields := v_fields || ARRAY['note:' || left(regexp_replace(NEW.error_message, '[^A-Za-z0-9_.:-]', '_', 'g'), 80)];
      END IF;
      v_err := NULL;
    ELSE
      v_err := NEW.error_message;
    END IF;

    PERFORM public.try_write_audit_log(
      CASE
        WHEN v_is_reconciled_sent THEN 'email_reconciled'
        ELSE
          CASE NEW.status
            WHEN 'pending' THEN 'email_queued'
            WHEN 'sent' THEN 'email_sent'
            WHEN 'failed' THEN 'email_failed'
            WHEN 'dlq' THEN 'email_dlq'
            WHEN 'rate_limited' THEN 'email_rate_limited'
            WHEN 'suppressed' THEN 'email_suppressed'
            WHEN 'bounced' THEN 'email_bounced'
            WHEN 'complained' THEN 'email_complained'
            WHEN 'reconciled' THEN 'email_reconciled'
            WHEN 'frequency_capped' THEN 'email_frequency_capped'
            ELSE 'email_' || NEW.status
          END
      END,
      'email_send_log',
      COALESCE(NEW.message_id, NEW.id::text),
      auth.uid(),
      v_fields,
      v_err
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('failed','dlq','bounced','complained') THEN
    resolved_event := CASE NEW.status
      WHEN 'failed' THEN 'email_failed'
      WHEN 'dlq' THEN 'email_dlq'
      WHEN 'bounced' THEN 'email_bounced'
      WHEN 'complained' THEN 'email_complained'
    END;
    PERFORM public.try_write_audit_log(
      resolved_event,
      'email_send_log',
      COALESCE(NEW.message_id, NEW.id::text),
      auth.uid(),
      ARRAY[
        COALESCE(NEW.template_name, ''),
        COALESCE(NEW.recipient_email, ''),
        COALESCE(NEW.status, ''),
        'transition:' || COALESCE(OLD.status,'null') || '->' || NEW.status
      ],
      NEW.error_message
    );
  END IF;

  RETURN NEW;
END;
$function$;
