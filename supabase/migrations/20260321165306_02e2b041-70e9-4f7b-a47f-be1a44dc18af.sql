-- Purge all stuck messages from the transactional_emails queue that are from
-- the old trigger (missing from/sender_domain/idempotency_key fields).
-- These have been retrying 985+ times and causing rate limits that block all emails.
SELECT pgmq.purge_queue('transactional_emails');

-- Also purge the DLQ of old broken messages
SELECT pgmq.purge_queue('transactional_emails_dlq');

-- Reset the rate-limit cooldown so the processor resumes immediately
UPDATE public.email_send_state
SET retry_after_until = NULL, updated_at = now()
WHERE id = 1;