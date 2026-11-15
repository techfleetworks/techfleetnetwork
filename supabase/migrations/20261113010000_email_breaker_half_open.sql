-- PR3b (announcement broadcast resilience): make the circuit breaker auto-recover.
--
-- BUG: the v2 breaker (email_lane_state, migration 20260609195852) has no live
-- open→half_open transition. On repeated Resend 429s record_email_attempt_result
-- flips a lane closed→open, but NOTHING ever writes circuit_state='half_open', so:
--   * the success branch that closes "WHEN circuit_state='half_open'" is unreachable;
--   * the lane stays 'open' forever with probe_at frozen at opened_at+30s;
--   * the only way back to 'closed' is the admin-only resume_email_lane().
-- (A correct state machine exists in _shared/email/domain/policies.ts but is NOT
-- wired into the SQL dispatch path.) So a transient provider blip permanently wedges
-- the lane into a de-facto-leaky 'open' that never formally recovers.
--
-- FIX — add the two missing transitions, nothing else:
--   1. claim_due_emails: after claiming a probe batch, promote open→half_open for any
--      lane whose probe window has elapsed, so the existing success-closes-from-half_open
--      logic becomes reachable.
--   2. record_email_attempt_result (rate_limited branch): a 429 while half_open re-opens
--      the lane with a fresh probe_at (a failed probe backs off again) — paces probing.
-- The closed→open open logic, the gate predicate, backoff, DLQ, suppression and the
-- success/close logic are copied VERBATIM. A healthy (closed) lane — including the auth
-- and transactional lanes these shared RPCs also gate — behaves exactly as before:
-- the new transitions only touch lanes already in 'open'/'half_open'. Proven by pgTAP
-- (email_breaker_half_open_test.sql), which asserts the full machine AND that a closed lane still
-- claims/sends normally.
--
-- Signatures, returns, grants unchanged → expand (a behaviour-preserving-for-closed
-- CREATE OR REPLACE), not a contract. Idempotent. Prod: hand-applied.
-- ADR: docs/adr/20261113-email-breaker-half-open.md.

-- ── 1. claim_due_emails: add the open→half_open promotion ─────────────────────
CREATE OR REPLACE FUNCTION public.claim_due_emails(p_max integer DEFAULT 25)
RETURNS TABLE (
  id uuid, lane text, template text, recipient text, subject text,
  payload jsonb, idempotency_key text, message_id text, attempts integer, trace_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH lane_open AS (
    -- Lane is eligible only if circuit closed (or half-open past probe_at) and not paused
    SELECT s.lane
    FROM email_lane_state s
    WHERE s.paused_by_admin = false
      AND (
        s.circuit_state = 'closed'
        OR (s.circuit_state = 'half_open' AND (s.probe_at IS NULL OR s.probe_at <= v_now))
        OR (s.circuit_state = 'open' AND s.probe_at IS NOT NULL AND s.probe_at <= v_now)
      )
  ),
  -- Fairness: priority order auth → transactional → bulk
  prioritized AS (
    SELECT o.*,
      CASE o.lane WHEN 'auth' THEN 1 WHEN 'transactional' THEN 2 ELSE 3 END AS prio
    FROM email_outbox o
    JOIN lane_open lo ON lo.lane = o.lane
    WHERE o.status = 'pending'
      AND o.next_attempt_at <= v_now
      AND o.expires_at > v_now
    ORDER BY prio, o.next_attempt_at
    LIMIT p_max
    FOR UPDATE OF o SKIP LOCKED
  ),
  claimed AS (
    UPDATE email_outbox o
    SET status = 'sending', claimed_at = v_now, updated_at = v_now
    FROM prioritized p
    WHERE o.id = p.id
    RETURNING o.id, o.lane, o.template, o.recipient, o.subject, o.payload,
              o.idempotency_key, o.message_id, o.attempts, o.trace_id
  )
  SELECT * FROM claimed;

  -- CircuitBreaker transition (NEW): a lane that was 'open' and whose probe window has
  -- elapsed has now been allowed to claim a probe batch, so move it to 'half_open'.
  -- This is the transition that was missing — without it circuit_state stayed 'open'
  -- forever and record_email_attempt_result's success-closes-from-half_open path could
  -- never fire. probe_at is left as-is (already elapsed) so the probe batch can send;
  -- a 429 on the probe re-arms probe_at (see record_email_attempt_result), a run of
  -- successes closes the lane. A 'closed' lane is never touched here.
  UPDATE email_lane_state
     SET circuit_state = 'half_open',
         -- Reset the success run on ENTRY to half_open. The success branch increments
         -- consecutive_success on every 'sent' regardless of state, so in-flight rows
         -- that complete after the lane opened can leave a stale high count; without
         -- this reset the first probe success would trip cb_close_success_threshold and
         -- close the lane after ONE success instead of a fresh run — defeating the
         -- paced recovery this transition exists to add.
         consecutive_success = 0,
         updated_at = v_now
   WHERE circuit_state = 'open'
     AND probe_at IS NOT NULL
     AND probe_at <= v_now
     AND paused_by_admin = false;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_emails(integer) TO service_role;

-- ── 2. record_email_attempt_result: add the half_open→open re-arm ─────────────
CREATE OR REPLACE FUNCTION public.record_email_attempt_result(
  p_id              uuid,
  p_outcome         text,
  p_status_code     integer DEFAULT NULL,
  p_error           text DEFAULT NULL,
  p_retry_after_s   integer DEFAULT NULL,
  p_workspace_quota boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_cfg     email_policy_config%ROWTYPE;
  v_row     email_outbox%ROWTYPE;
  v_lane    email_lane_state%ROWTYPE;
  v_now     timestamptz := now();
  v_attempt integer;
  v_next    timestamptz;
  v_cap     integer;
  v_base    integer;
  v_secs    integer;
BEGIN
  SELECT * INTO v_cfg FROM email_policy_config WHERE id = 1;
  SELECT * INTO v_row FROM email_outbox WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_lane FROM email_lane_state WHERE lane = v_row.lane FOR UPDATE;

  v_attempt := v_row.attempts + 1;

  IF p_outcome = 'sent' THEN
    UPDATE email_outbox SET
      status = 'sent', attempts = v_attempt, sent_at = v_now, updated_at = v_now,
      last_status_code = p_status_code, last_error = NULL,
      attempt_history = attempt_history || jsonb_build_object('t', v_now, 'outcome','sent','code',p_status_code)
    WHERE id = p_id;

    -- CircuitBreaker: success closes from half_open after threshold; resets recent_429 window
    UPDATE email_lane_state SET
      consecutive_success = consecutive_success + 1,
      circuit_state = CASE
        WHEN circuit_state = 'half_open'
             AND consecutive_success + 1 >= v_cfg.cb_close_success_threshold
        THEN 'closed' ELSE circuit_state END,
      opened_at = CASE WHEN circuit_state = 'half_open'
             AND consecutive_success + 1 >= v_cfg.cb_close_success_threshold
        THEN NULL ELSE opened_at END,
      probe_at  = CASE WHEN circuit_state = 'half_open'
             AND consecutive_success + 1 >= v_cfg.cb_close_success_threshold
        THEN NULL ELSE probe_at END,
      recent_429_count = 0,
      recent_429_window_start = NULL,
      updated_at = v_now
    WHERE lane = v_row.lane;
    RETURN;
  END IF;

  IF p_outcome = 'suppressed' THEN
    UPDATE email_outbox SET status='suppressed', updated_at=v_now,
      last_error='recipient suppressed' WHERE id=p_id;
    RETURN;
  END IF;

  IF p_outcome = 'permanent_fail' THEN
    UPDATE email_outbox SET status='dlq', dlq_at=v_now, dlq_reason=COALESCE(p_error,'permanent_fail'),
      last_status_code=p_status_code, attempts=v_attempt, updated_at=v_now,
      attempt_history = attempt_history || jsonb_build_object('t',v_now,'outcome','permanent_fail','code',p_status_code,'err',p_error)
    WHERE id=p_id;
    RETURN;
  END IF;

  -- Retryable: compute backoff
  v_cap  := CASE WHEN p_workspace_quota THEN v_cfg.workspace_quota_cap_seconds ELSE v_cfg.max_backoff_seconds END;
  v_base := CASE WHEN p_workspace_quota THEN LEAST(30, v_cfg.base_backoff_seconds) ELSE v_cfg.base_backoff_seconds END;
  v_secs := LEAST(GREATEST(COALESCE(p_retry_after_s,0), v_base * (2 ^ LEAST(v_attempt-1,8))::int), v_cap);
  v_next := v_now + (v_secs || ' seconds')::interval;

  -- DLQ on max attempts (8) or past expiry
  IF v_attempt >= 8 OR v_row.expires_at <= v_now THEN
    UPDATE email_outbox SET status='dlq', dlq_at=v_now,
      dlq_reason=COALESCE(p_error, CASE WHEN v_attempt >= 8 THEN 'max_attempts' ELSE 'expired' END),
      last_status_code=p_status_code, attempts=v_attempt, updated_at=v_now,
      attempt_history = attempt_history || jsonb_build_object('t',v_now,'outcome','dlq','code',p_status_code,'err',p_error)
    WHERE id=p_id;
  ELSE
    UPDATE email_outbox SET status='pending', next_attempt_at=v_next, attempts=v_attempt,
      last_error=p_error, last_status_code=p_status_code, updated_at=v_now,
      attempt_history = attempt_history || jsonb_build_object('t',v_now,'outcome',p_outcome,'code',p_status_code,'err',p_error,'next',v_next)
    WHERE id=p_id;
  END IF;

  -- CircuitBreaker: 429 advances the breaker
  IF p_outcome = 'rate_limited' THEN
    UPDATE email_lane_state SET
      consecutive_success = 0,
      recent_429_window_start = CASE
        WHEN recent_429_window_start IS NULL
          OR recent_429_window_start < v_now - (v_cfg.cb_open_window_seconds || ' seconds')::interval
        THEN v_now ELSE recent_429_window_start END,
      recent_429_count = CASE
        WHEN recent_429_window_start IS NULL
          OR recent_429_window_start < v_now - (v_cfg.cb_open_window_seconds || ' seconds')::interval
        THEN 1 ELSE recent_429_count + 1 END,
      updated_at = v_now
    WHERE lane = v_row.lane;

    UPDATE email_lane_state SET
      circuit_state = 'open',
      opened_at = v_now,
      probe_at  = v_now + (v_cfg.cb_half_open_probe_seconds || ' seconds')::interval
    WHERE lane = v_row.lane
      AND circuit_state = 'closed'
      AND recent_429_count >= v_cfg.cb_open_threshold_429s;

    -- NEW: a 429 received while HALF_OPEN means the probe failed — re-open the lane
    -- with a fresh probe window and reset the success run. Without this the lane would
    -- keep sending probes in half_open while the provider is still rate-limiting.
    UPDATE email_lane_state SET
      circuit_state = 'open',
      opened_at = v_now,
      consecutive_success = 0,
      probe_at = v_now + (v_cfg.cb_half_open_probe_seconds || ' seconds')::interval
    WHERE lane = v_row.lane
      AND circuit_state = 'half_open';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_email_attempt_result(uuid,text,integer,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_attempt_result(uuid,text,integer,text,integer,boolean) TO service_role;
