-- pgTAP: audit_email_send_log() skips the per-recipient bulk-announcement enqueue
-- markers (the hash-chain storm that made the enqueue slow) WITHOUT losing any
-- compliance-relevant audit — other lanes, and announcement delivery FAILURES, are
-- still audited. record_id on the audit row is COALESCE(message_id, id::text).
-- Run: `supabase db test`. Rolled back at end.
--
-- Proves:
--   1. an announcement 'pending' marker insert is NOT audited (the storm is removed)
--   2. the guard is precise: a NON-pending announcement insert IS still audited
--   3. a NON-announcement (auth) 'pending' insert IS still audited (no regression)
--   4. an announcement DELIVERY FAILURE (UPDATE → bounced) IS still audited

BEGIN;
SELECT plan(4);

-- (1) announcement + pending → skipped
INSERT INTO public.email_send_log (message_id, recipient_email, template_name, status)
VALUES ('audit-scope-ann-pending', 'ann-p@example.com', 'announcement', 'pending');
SELECT is(
  (SELECT count(*)::int FROM public.audit_log WHERE record_id = 'audit-scope-ann-pending'),
  0, 'an announcement pending marker is NOT audited — the per-recipient storm is removed');

-- (2) announcement + non-pending (sent) → still audited (guard is narrow)
INSERT INTO public.email_send_log (message_id, recipient_email, template_name, status)
VALUES ('audit-scope-ann-sent', 'ann-s@example.com', 'announcement', 'sent');
SELECT is(
  (SELECT count(*)::int FROM public.audit_log WHERE record_id = 'audit-scope-ann-sent'),
  1, 'a non-pending announcement insert IS still audited (guard is precise to pending markers)');

-- (3) auth lane pending → still audited (no compliance regression on other lanes)
INSERT INTO public.email_send_log (message_id, recipient_email, template_name, status)
VALUES ('audit-scope-auth-pending', 'auth-p@example.com', 'recovery', 'pending');
SELECT is(
  (SELECT count(*)::int FROM public.audit_log WHERE record_id = 'audit-scope-auth-pending'),
  1, 'a non-announcement (auth) pending insert IS still audited');

-- (4) announcement delivery failure (UPDATE → bounced) → still audited
UPDATE public.email_send_log SET status = 'bounced' WHERE message_id = 'audit-scope-ann-pending';
SELECT ok(
  EXISTS (SELECT 1 FROM public.audit_log
            WHERE record_id = 'audit-scope-ann-pending' AND event_type = 'email_bounced'),
  'an announcement delivery FAILURE is still audited (only the queued marker was skipped)');

SELECT * FROM finish();
ROLLBACK;
