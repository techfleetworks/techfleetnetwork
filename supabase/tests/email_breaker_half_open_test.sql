-- pgTAP: the email circuit breaker auto-recovers (closed→open→half_open→closed) and
-- a 429 while half_open re-opens it — WITHOUT changing how a healthy (closed) lane
-- behaves. These are shared RPCs that gate the auth/transactional lanes too, so the
-- "closed lane unaffected" assertions are the auth-safety proof.
-- Run: `supabase db test`. Rolled back at end.

BEGIN;
SELECT plan(11);

-- Helper state: thresholds come from email_policy_config (seeded id=1):
--   cb_open_threshold_429s=3, cb_half_open_probe_seconds=30, cb_close_success_threshold=5.

-- ══ Scenario A: open + elapsed probe window → claim promotes to half_open ══════
UPDATE public.email_lane_state
   SET circuit_state='open', opened_at=now()-interval '5 min',
       probe_at=now()-interval '1 min', paused_by_admin=false,
       recent_429_count=0, consecutive_success=0
 WHERE lane='bulk';

INSERT INTO public.email_outbox (id, lane, template, recipient, idempotency_key, message_id, status, next_attempt_at, expires_at)
VALUES ('00000000-0000-4000-8000-00000000c001','bulk','announcement','brk-a@example.com',
        'brk-test-a','brk-test-a','pending', now()-interval '1 min', now()+interval '30 min');

SELECT lives_ok($$ SELECT public.claim_due_emails(25) $$, 'claim_due_emails runs');

SELECT is((SELECT circuit_state FROM public.email_lane_state WHERE lane='bulk'),
  'half_open', 'A: an open lane past its probe window is promoted to half_open on claim');

SELECT is((SELECT status FROM public.email_outbox WHERE id='00000000-0000-4000-8000-00000000c001'),
  'sending', 'A: the probe row was actually claimed');

-- ══ Scenario B: a CLOSED lane is NOT touched by the promotion (auth-safety) ════
UPDATE public.email_lane_state SET circuit_state='closed', opened_at=NULL, probe_at=NULL WHERE lane='auth';
INSERT INTO public.email_outbox (id, lane, template, recipient, idempotency_key, message_id, status, next_attempt_at, expires_at)
VALUES ('00000000-0000-4000-8000-00000000c002','auth','recovery','brk-auth@example.com',
        'brk-test-auth','brk-test-auth','pending', now()-interval '1 min', now()+interval '30 min');

SELECT lives_ok($$ SELECT public.claim_due_emails(25) $$, 'claim runs with a closed auth lane');
SELECT is((SELECT circuit_state FROM public.email_lane_state WHERE lane='auth'),
  'closed', 'B: a healthy closed lane stays closed — auth behaviour unchanged');
SELECT is((SELECT status FROM public.email_outbox WHERE id='00000000-0000-4000-8000-00000000c002'),
  'sending', 'B: the closed auth lane still CLAIMS its row (send path unchanged, not just state)');

-- ══ Scenario C: a 429 while HALF_OPEN re-opens the lane (failed probe) ═════════
UPDATE public.email_lane_state
   SET circuit_state='half_open', opened_at=now()-interval '2 min',
       probe_at=now()-interval '30 s', consecutive_success=2,
       recent_429_count=0, recent_429_window_start=NULL
 WHERE lane='bulk';
INSERT INTO public.email_outbox (id, lane, template, recipient, idempotency_key, message_id, status, attempts, next_attempt_at, expires_at)
VALUES ('00000000-0000-4000-8000-00000000c003','bulk','announcement','brk-c@example.com',
        'brk-test-c','brk-test-c','sending', 0, now()-interval '1 min', now()+interval '30 min');

SELECT lives_ok(
  $$ SELECT public.record_email_attempt_result('00000000-0000-4000-8000-00000000c003','rate_limited',429) $$,
  'record 429 on a half_open lane runs');
SELECT is((SELECT circuit_state FROM public.email_lane_state WHERE lane='bulk'),
  'open', 'C: a 429 while half_open re-opens the lane');
SELECT ok((SELECT probe_at > now() FROM public.email_lane_state WHERE lane='bulk'),
  'C: re-opening sets a fresh (future) probe window');

-- ══ Scenario D: successes in HALF_OPEN close the lane at threshold ═════════════
UPDATE public.email_lane_state
   SET circuit_state='half_open', opened_at=now()-interval '2 min',
       probe_at=now()-interval '30 s', consecutive_success=4   -- one shy of the close threshold (5)
 WHERE lane='bulk';
INSERT INTO public.email_outbox (id, lane, template, recipient, idempotency_key, message_id, status, attempts, next_attempt_at, expires_at)
VALUES ('00000000-0000-4000-8000-00000000c004','bulk','announcement','brk-d@example.com',
        'brk-test-d','brk-test-d','sending', 0, now()-interval '1 min', now()+interval '30 min');

SELECT public.record_email_attempt_result('00000000-0000-4000-8000-00000000c004','sent',202);
SELECT is((SELECT circuit_state FROM public.email_lane_state WHERE lane='bulk'),
  'closed', 'D: the 5th consecutive success in half_open closes the lane');

-- ══ Scenario E: a STALE success count must not close the lane on the first probe ══
-- A lane can carry a high consecutive_success into half_open (in-flight rows complete
-- as 'sent' after a 429 opened the lane). Entering half_open must reset the run, so one
-- probe success does NOT instantly close. (Fails before the cs-reset fix, passes after.)
UPDATE public.email_lane_state
   SET circuit_state='open', opened_at=now()-interval '5 min',
       probe_at=now()-interval '1 min', consecutive_success=20, recent_429_count=0
 WHERE lane='bulk';
INSERT INTO public.email_outbox (id, lane, template, recipient, idempotency_key, message_id, status, attempts, next_attempt_at, expires_at)
VALUES ('00000000-0000-4000-8000-00000000c005','bulk','announcement','brk-e@example.com',
        'brk-test-e','brk-test-e','pending', 0, now()-interval '1 min', now()+interval '30 min');

SELECT public.claim_due_emails(25);  -- promotes bulk open→half_open (and must reset the stale cs)
SELECT public.record_email_attempt_result('00000000-0000-4000-8000-00000000c005','sent',202);  -- ONE success
SELECT is((SELECT circuit_state FROM public.email_lane_state WHERE lane='bulk'),
  'half_open', 'E: one probe success does NOT close a lane that entered half_open with a stale success count');

SELECT * FROM finish();
ROLLBACK;
