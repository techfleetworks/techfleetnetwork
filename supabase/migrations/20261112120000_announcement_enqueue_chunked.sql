-- PR2 (announcement broadcast resilience): bounded, resumable enqueue.
--
-- PR1 widened enqueue_announcement_emails's statement_timeout to 120s so the
-- single-shot set-based INSERT of the whole audience stops being cancelled. That
-- removes today's failure but is scaling-latent: one unbounded statement is still
-- one statement, and at a large enough audience 120s is also finite.
--
-- STRUCTURAL FIX (invariant I1 — no statement enqueues more than BATCH rows):
-- split the fan-out into bounded, cursor-advanced batches. enqueue_announcement_batch
-- inserts the next <= p_batch_size eligible recipients after a cursor, so every
-- statement is bounded regardless of audience size and cannot time out. The caller
-- loops until a short batch signals the end; a crash mid-loop leaves committed
-- batches in place and a re-run (idempotent via the unique idempotency_key) resumes
-- without double-sending. Audience size is no longer a correctness factor.
--
-- Also removes a latent duplication: the opted-in / not-suppressed audience predicate
-- lived inline in enqueue_announcement_emails and would now be copied into the batch
-- function. announcement_eligible_emails() becomes the ONE owner; both callers use it.
--
-- Expand-only (ADR-0026): adds two functions and rewrites enqueue_announcement_emails'
-- body WITHOUT changing its signature, return shape, or audience semantics (the full
-- branch now selects from the shared owner; the test-list branch is unchanged). No
-- column/constraint/signature is dropped. Idempotent (CREATE OR REPLACE).
--
-- Prod: hand-applied. pgTAP: supabase/tests/announcement_enqueue_chunked_test.sql.
-- ADR: docs/adr/20261112-announcement-enqueue-chunked.md.

-- ── 1. Single owner of the full-send audience ────────────────────────────────
-- Opted-in (default-true notify_opportunities is the Tier-1 opt-out, ADR-0017),
-- a usable email, not globally suppressed. Normalized identically to the old JS
-- path (email.trim().toLowerCase()). DISTINCT so duplicate profile emails collapse.
CREATE OR REPLACE FUNCTION public.announcement_eligible_emails()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT lower(regexp_replace(pr.email, '^\s+|\s+$', '', 'g')) AS email
  FROM profiles pr
  WHERE pr.notify_opportunities IS TRUE
    AND regexp_replace(coalesce(pr.email, ''), '^\s+|\s+$', '', 'g') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.suppressed_emails s
      WHERE lower(regexp_replace(s.email, '^\s+|\s+$', '', 'g'))
          = lower(regexp_replace(pr.email, '^\s+|\s+$', '', 'g'))
    );
$$;

REVOKE ALL ON FUNCTION public.announcement_eligible_emails()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_eligible_emails() TO service_role;

-- ── 2. Refactor the full-send RPC to use the one owner (behaviour unchanged) ──
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
SET statement_timeout = '120s'            -- PR1 attribute, preserved
AS $$
#variable_conflict use_column
DECLARE
  v_exp timestamptz := now() + interval '24 hours';
BEGIN
  RETURN QUERY
  WITH audience AS (
    -- Full send: the one audience owner. announcement_eligible_emails() RETURNS SETOF
    -- text, so its column must be aliased (AS e(email)) — otherwise the column is named
    -- after the function and "email" does not resolve.
    SELECT e.email FROM public.announcement_eligible_emails() AS e(email)
    WHERE p_recipients IS NULL
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
      'bulk', 'announcement', a.email, p_subject,
      jsonb_build_object(
        'html', p_html, 'text', p_text,
        'from', 'Tech Fleet <onboarding@techfleet.org>',
        'sender_domain', 'notify.techfleet.org',
        'label', 'announcement', 'purpose', 'transactional',
        'announcement_id', p_announcement_id::text
      ),
      'announcement-' || p_announcement_id::text || '-' || a.email,
      'announcement-' || p_announcement_id::text || '-' || a.email,
      v_exp
    FROM audience a
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'pending', expires_at = EXCLUDED.expires_at,
          next_attempt_at = now(), attempts = 0, updated_at = now()
      WHERE email_outbox.status = 'expired'
    RETURNING recipient, message_id
  ),
  logged AS (
    INSERT INTO email_send_log (message_id, recipient_email, template_name, status, metadata)
    SELECT i.message_id, i.recipient, 'announcement', 'pending',
           jsonb_build_object('announcement_id', p_announcement_id::text, 'set_based', true)
    FROM ins i
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM audience), (SELECT count(*)::int FROM ins);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_announcement_emails(uuid, text, text, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_announcement_emails(uuid, text, text, text, text[])
  TO service_role;

-- ── 3. The bounded batch — the structural fix ────────────────────────────────
-- Enqueues the next <= p_batch_size eligible recipients whose normalized email is
-- strictly greater than p_after_email (the cursor), ordered by email. Returns the
-- cursor to pass next (last_email), how many rows the slice CONSIDERED (so the caller
-- knows it has reached the end when considered < p_batch_size), and how many were
-- newly INSERTED (ON CONFLICT re-drives only a prior-send 'expired' row). Every
-- statement here touches at most p_batch_size rows, so it cannot time out.
CREATE OR REPLACE FUNCTION public.enqueue_announcement_batch(
  p_announcement_id uuid,
  p_subject         text,
  p_html            text,
  p_text            text,
  p_after_email     text DEFAULT '',
  p_batch_size      integer DEFAULT 500
-- effective_batch is the size this call ACTUALLY used after clamping. The caller must
-- detect end-of-audience on `considered < effective_batch`, NOT on the size it
-- requested: if it asked for more than the clamp, a full slice would otherwise look
-- short and the loop would stop early — a silent under-enqueue, the exact failure
-- this function exists to prevent.
) RETURNS TABLE (last_email text, considered integer, inserted integer, effective_batch integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_exp timestamptz := now() + interval '24 hours';
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000)); -- clamp
BEGIN
  RETURN QUERY
  WITH slice AS (
    SELECT e.email
    FROM public.announcement_eligible_emails() AS e(email)
    WHERE e.email > coalesce(p_after_email, '')
    ORDER BY e.email
    LIMIT v_batch
  ),
  ins AS (
    INSERT INTO email_outbox (
      lane, template, recipient, subject, payload, idempotency_key, message_id, expires_at
    )
    SELECT
      'bulk', 'announcement', s.email, p_subject,
      jsonb_build_object(
        'html', p_html, 'text', p_text,
        'from', 'Tech Fleet <onboarding@techfleet.org>',
        'sender_domain', 'notify.techfleet.org',
        'label', 'announcement', 'purpose', 'transactional',
        'announcement_id', p_announcement_id::text
      ),
      'announcement-' || p_announcement_id::text || '-' || s.email,
      'announcement-' || p_announcement_id::text || '-' || s.email,
      v_exp
    FROM slice s
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'pending', expires_at = EXCLUDED.expires_at,
          next_attempt_at = now(), attempts = 0, updated_at = now()
      WHERE email_outbox.status = 'expired'
    RETURNING recipient, message_id
  ),
  logged AS (
    INSERT INTO email_send_log (message_id, recipient_email, template_name, status, metadata)
    SELECT i.message_id, i.recipient, 'announcement', 'pending',
           jsonb_build_object('announcement_id', p_announcement_id::text, 'set_based', true, 'batched', true)
    FROM ins i
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT max(s.email) FROM slice s),      -- cursor for the next call (NULL when the slice is empty)
    (SELECT count(*)::int FROM slice),       -- considered this slice
    (SELECT count(*)::int FROM ins),         -- newly enqueued this slice
    v_batch;                                 -- the effective (clamped) batch size the caller must compare against
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_announcement_batch(uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_announcement_batch(uuid, text, text, text, text, integer)
  TO service_role;
