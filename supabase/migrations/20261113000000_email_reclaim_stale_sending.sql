-- PR3 (announcement broadcast resilience): reclaim stuck 'sending' rows.
--
-- BUG (invariant I3/F5 — self-heal in-flight): the dispatcher claims a whole batch
-- to status='sending' in one statement, then sends one row at a time. On a Resend
-- 429 it breaks the loop, recording the 429'd row back to 'pending' but leaving the
-- rest of the already-claimed batch in 'sending'. Nothing returns those to 'pending'.
-- Once they pass expires_at (bulk default 60 min) the every-5-min expire_stale_pending_v2
-- sweep moves them to 'expired' — a silent under-reach. A crashed/timed-out dispatch
-- invocation orphans its in-flight batch the same way.
--
-- FIX: a BULK row that has been 'sending' longer than the lease, but is NOT yet
-- expired, is an orphan — return it to 'pending' so the dispatcher retries it. The
-- lease is 10 minutes: longer than the edge runtime's hard wall-clock cap, so a row
-- still 'sending' past it is provably from a DEAD dispatch invocation, not a slow
-- live one — which closes the double-send race (a live dispatcher cannot be mid-send
-- on a row we reclaim). The cron runs every 2 minutes, far ahead of the 60-min bulk
-- expiry, so orphans are reclaimed and retried instead of silently expired.
--
-- BULK ONLY, on purpose. The same orphaning exists on the auth/transactional lanes,
-- but reclaiming there is at-least-once redelivery of OTP / magic-link / password-reset
-- mail (a duplicate of the SAME message, bounded — but real), and auth is the highest-
-- blast-radius, actively-refactored area. So auth/tx reclaim is deferred to PR3b, which
-- adds it WITH a dedicated auth-lane pgTAP and a provider-side idempotency key. This
-- migration's scope therefore matches its tests exactly.
--
-- Expand-only / additive: a new SECURITY DEFINER function + a new cron job. No
-- existing function, table, or cron is modified. (The breaker half-open auto-close —
-- which rewrites the shared claim_due_emails / record_email_attempt_result RPCs that
-- gate the auth and transactional lanes too — also ships in PR3b.)
--
-- Prod: hand-applied. pgTAP: supabase/tests/email_reclaim_stale_sending_test.sql.
-- ADR: docs/adr/20261113-email-reclaim-stale-sending.md.

CREATE OR REPLACE FUNCTION public.reclaim_stale_sending_v2()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.email_outbox
     SET status          = 'pending',
         next_attempt_at = now(),   -- immediately eligible for the next claim
         claimed_at      = NULL,    -- clears the lease
         updated_at      = now()
   WHERE status = 'sending'
     AND lane = 'bulk'                                   -- BULK ONLY: auth/tx reclaim is at-least-once
                                                         -- redelivery of OTP/magic-link mail and ships in
                                                         -- PR3b with its own auth-lane pgTAP (see ADR).
     AND claimed_at IS NOT NULL
     AND claimed_at < now() - interval '10 minutes'      -- lease > the edge runtime's hard cap, so a still-
                                                         -- 'sending' row is provably from a DEAD invocation,
                                                         -- not a slow live one (no double-send race)
     AND (expires_at IS NULL OR expires_at > now());     -- an already-expired row is the expiry job's business
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_stale_sending_v2() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_sending_v2() TO service_role;

-- Every 2 minutes, ahead of the 5-minute expire-stale sweep, so an orphan is
-- reclaimed for retry rather than expired. Idempotent re-schedule.
DO $$ BEGIN PERFORM cron.unschedule('email-v2-reclaim-sending'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('email-v2-reclaim-sending', '*/2 * * * *',
  $cron$ SELECT public.reclaim_stale_sending_v2(); $cron$);
