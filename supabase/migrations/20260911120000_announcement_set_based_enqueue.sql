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
-- expires_at: broadcasts get a 24h claim window (NOT email_policy_config's 60-min
-- transactional `pending_expiry_minutes`). A 1,579-row burst can take a few hours
-- to drain the bulk lane; a 60-min window would expire the tail before the
-- dispatcher reached it — re-introducing under-reach by a different door.
--
-- Prod: hand-applied via `supabase db push` (no prod migration CI/ledger).
--
-- BDD:
--   Scenario: full audience is enqueued atomically
--     Given N members have notify_opportunities = true and a non-empty email
--     When enqueue_announcement_emails(<id>, subject, html, text) is called
--     Then exactly N distinct email_outbox rows exist for that announcement
--     And a second identical call enqueues 0 new rows (idempotent, no duplicates)
--   Scenario: delivery test does not touch the member base
--     Given p_recipients = ARRAY['qa@techfleet.org']
--     When enqueue_announcement_emails(<id>, subject, html, text, p_recipients) is called
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
DECLARE
  v_exp timestamptz := now() + interval '24 hours';
BEGIN
  RETURN QUERY
  WITH audience AS (
    -- Full send: every opted-in member with a usable email (default-true
    -- notify_opportunities is the Tier-1 opt-out; ADR-0017 keeps marketing in EO).
    SELECT DISTINCT lower(btrim(pr.email)) AS email
    FROM profiles pr
    WHERE p_recipients IS NULL
      AND pr.notify_opportunities IS TRUE
      AND btrim(coalesce(pr.email, '')) <> ''
    UNION
    -- Test send: exactly the addresses the caller passed, nothing from profiles.
    SELECT DISTINCT lower(btrim(r)) AS email
    FROM unnest(coalesce(p_recipients, ARRAY[]::text[])) AS r
    WHERE p_recipients IS NOT NULL
      AND btrim(coalesce(r, '')) <> ''
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
        'unsubscribe_token', gen_random_uuid()::text,
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
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING recipient, message_id
  ),
  logged AS (
    -- Enqueue marker for the admin dashboards that read email_send_log by
    -- metadata->>'announcement_id' (delivery truth still lives in email_outbox).
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
