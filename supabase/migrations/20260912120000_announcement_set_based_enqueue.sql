-- Set-based announcement enqueue (fixes: announcement reached ~198/1579).
--
-- ROOT CAUSE the previous design could not avoid: send-announcement-email looped
-- over recipients doing ~5 sequential DB round-trips EACH inside one edge
-- invocation. For 1,579 members that is ~8,000 serial round-trips; the runtime
-- killed the invocation at ~200, so the rest were NEVER enqueued (a *variable*
-- ceiling — 250 one send, 198 the next — which is the signature of a timeout,
-- not a fixed row cap).
--
-- STRUCTURAL FIX: enqueue the whole audience in ONE atomic statement. There is
-- no loop to partially complete — the INSERT..SELECT either enqueues every
-- eligible recipient or the transaction rolls back. Cost is O(1) round-trips
-- from the edge function regardless of member count, so it cannot time out, and
-- there is no PostgREST page in the path to silently truncate. Row shape mirrors
-- enqueue_email_v2 (lane='bulk', unique idempotency_key => idempotent re-runs).
--
-- Suppression: the audience anti-joins suppressed_emails, restoring the gate the
-- prior enqueueEmail() path enforced (v2 checks suppression ONLY at enqueue —
-- dispatch/provider never re-check). Without it a broadcast re-mails every
-- hard-bounced / complained / unsubscribed address, spiking the bulk lane's
-- bounce/complaint rate and risking provider throttling.
--
-- Email normalization mirrors the prior JS path (email.trim().toLowerCase()) so the
-- deterministic key byte-matches rows already enqueued by the timed-out send for
-- every real email address. btrim() (the first cut) stripped only ASCII spaces;
-- regexp_replace('^\s+|\s+$') strips the ASCII whitespace JS .trim() removes, so
-- ON CONFLICT recognizes the ~198 already-present rows and the recovery run does not
-- double-send them. (PG POSIX \s is ASCII-only vs JS's Unicode .trim(); they can
-- differ only for non-ASCII edge whitespace, which is not a valid email value.)
--
-- expires_at: broadcasts get a 24h claim window (NOT email_policy_config's 60-min
-- transactional `pending_expiry_minutes`). A 1,579-row burst can take a few hours
-- to drain the bulk lane; a 60-min window would expire the tail before the
-- dispatcher reached it — re-introducing under-reach by a different door.
--
-- Recovery reach: ON CONFLICT DO UPDATE re-drives rows that a PRIOR send left
-- 'expired' (the old 60-min window), but ONLY 'expired' — 'sent'/'sending'/
-- 'suppressed'/'dlq' fall through untouched, so no one is double-sent and
-- deliberate terminal states are preserved.
--
-- Prod: hand-applied via `supabase db push` (no prod migration CI/ledger).
--
-- BDD:
--   Scenario: full audience is enqueued atomically
--     Given N members have notify_opportunities = true, a non-empty email, and are not suppressed
--     When enqueue_announcement_emails(<id>, subject, html, text) is called
--     Then exactly N distinct email_outbox rows exist for that announcement
--     And a second identical call enqueues 0 new rows (idempotent, no duplicates)
--   Scenario: suppressed members are excluded
--     Given an opted-in member whose email is in suppressed_emails
--     Then they are NOT enqueued
--   Scenario: a prior-send expired row is re-driven, a sent row is not
--     Given a recipient's only outbox row for this announcement is status='expired'
--     When the send is re-run
--     Then that row returns to status='pending' (re-driven), while 'sent' rows are untouched
--   Scenario: delivery test does not touch the member base
--     Given p_recipients = ARRAY['qa@techfleet.org']
--     Then only that address is enqueued and the profiles audience is untouched

CREATE OR REPLACE FUNCTION public.enqueue_announcement_emails(
  p_announcement_id uuid,
  p_subject         text,
  p_html            text,
  p_text            text,
  p_recipients      text[] DEFAULT NULL   -- NULL = full eligible audience; non-NULL = explicit test list
) RETURNS TABLE (eligible_count integer, enqueued_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_exp timestamptz := now() + interval '24 hours';
BEGIN
  RETURN QUERY
  WITH audience AS (
    -- Full send: opted-in (default-true notify_opportunities is the Tier-1 opt-out;
    -- ADR-0017 keeps marketing in EO), a usable email, and NOT globally suppressed.
    -- Normalize identically to the old JS path: email.trim().toLowerCase().
    SELECT DISTINCT lower(regexp_replace(pr.email, '^\s+|\s+$', '', 'g')) AS email
    FROM profiles pr
    WHERE p_recipients IS NULL
      AND pr.notify_opportunities IS TRUE
      AND regexp_replace(coalesce(pr.email, ''), '^\s+|\s+$', '', 'g') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.suppressed_emails s
        WHERE lower(regexp_replace(s.email, '^\s+|\s+$', '', 'g'))
            = lower(regexp_replace(pr.email, '^\s+|\s+$', '', 'g'))
      )
    UNION
    -- Delivery probe: exactly the addresses passed (a known QA inbox). Suppression
    -- is intentionally NOT applied so an admin can always test delivery to themselves.
    SELECT DISTINCT lower(regexp_replace(r, '^\s+|\s+$', '', 'g')) AS email
    FROM unnest(coalesce(p_recipients, ARRAY[]::text[])) AS r
    WHERE p_recipients IS NOT NULL
      AND regexp_replace(coalesce(r, ''), '^\s+|\s+$', '', 'g') <> ''
  ),
  ins AS (
    INSERT INTO email_outbox (
      lane, template, recipient, subject, payload, idempotency_key, message_id, expires_at
    )
    SELECT
      'bulk',
      'announcement',
      a.email,
      p_subject,
      jsonb_build_object(
        'html', p_html,
        'text', p_text,
        'from', 'Tech Fleet <onboarding@techfleet.org>',
        'sender_domain', 'notify.techfleet.org',
        'label', 'announcement',
        'purpose', 'transactional',
        'announcement_id', p_announcement_id::text
      ),
      -- Deterministic per (announcement, recipient): a retry maps to the same
      -- key, so the UNIQUE(idempotency_key) index makes re-runs a no-op instead
      -- of a re-blast (Audit H8).
      'announcement-' || p_announcement_id::text || '-' || a.email,
      'announcement-' || p_announcement_id::text || '-' || a.email,
      v_exp
    FROM audience a
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'pending', expires_at = EXCLUDED.expires_at,
          next_attempt_at = now(), attempts = 0, updated_at = now()
      WHERE email_outbox.status = 'expired'   -- re-drive ONLY a prior-send expiry; never re-send terminal rows
    RETURNING recipient, message_id
  ),
  logged AS (
    -- Enqueue marker for the admin dashboards that read email_send_log by
    -- metadata->>'announcement_id' (delivery truth still lives in email_outbox;
    -- the outbox->log write-back trigger flips these 'pending' rows to 'sent').
    INSERT INTO email_send_log (message_id, recipient_email, template_name, status, metadata)
    SELECT i.message_id, i.recipient, 'announcement', 'pending',
           jsonb_build_object('announcement_id', p_announcement_id::text, 'set_based', true)
    FROM ins i
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::int FROM audience),
    (SELECT count(*)::int FROM ins);
END;
$$;

-- Service-role only; the edge function verifies the caller is an admin before
-- invoking with the service-role client (same trust model as enqueue_email_v2).
REVOKE ALL ON FUNCTION public.enqueue_announcement_emails(uuid, text, text, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_announcement_emails(uuid, text, text, text, text[])
  TO service_role;

-- ── Debounce the instant-dispatch ping so a bulk enqueue does not fan out ──────
-- email_outbox has an AFTER INSERT FOR EACH ROW trigger (trg_notify_email_outbox_v2)
-- that POSTs to the email-dispatcher for every pending row. A single 1,579-row
-- announcement INSERT therefore fired ~1,579 near-simultaneous dispatcher
-- invocations, tripping the bulk-lane circuit breaker on Resend 429s and wasting
-- ~1,500 empty invocations. A transaction-local GUC collapses that to ONE ping per
-- statement/transaction (advisory locks are re-entrant, so they would NOT dedupe
-- same-transaction calls). Single-row inserts and the 30-60s cron each start a
-- fresh transaction, so their pings are unchanged; the cron remains the safety net.
CREATE OR REPLACE FUNCTION public.notify_email_outbox_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_net
AS $$
BEGIN
  -- Only ping for actionable rows; status defaults to 'pending'.
  IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
  -- Already pinged in this transaction? one ping per statement is enough.
  IF current_setting('email.dispatch_pinged', true) = 'true' THEN RETURN NEW; END IF;
  PERFORM set_config('email.dispatch_pinged', 'true', true);  -- transaction-local
  BEGIN
    PERFORM public.invoke_email_dispatcher_cron();
  EXCEPTION WHEN OTHERS THEN
    -- Never let the dispatch ping fail an enqueue; cron is the safety net.
    NULL;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_email_outbox_v2() FROM PUBLIC, anon, authenticated;
