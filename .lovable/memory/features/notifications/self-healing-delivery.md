---
name: Self-healing in-app notification delivery
description: Outbox + retry + DLQ system that guarantees in-app notifications are delivered or auto-reported to admins.
type: feature
---
All in-app notifications go through `safe_create_notification(p_user_id, p_title, p_body_html, p_notification_type, p_link_url, p_source)`.

Flow:
1. Row is enqueued to `notification_outbox` (durable record).
2. Immediate insert into `notifications` is attempted.
3. On failure: outbox row keeps `last_error`, `attempts`, and `next_attempt_at` (30s backoff). An `audit_log` entry of type `notification_insert_failed` fires the admin alert trigger.
4. `drain_notification_outbox(limit)` runs every minute via pg_cron. It retries with exponential backoff (30s → 2m → 8m → 32m).
5. After 5 attempts, the row is moved to `notification_dlq` and an audit event of type `notification_dlq` fires the admin alert.

Edge functions (`notify-applicant-status`, `mark-interview-scheduled`) call the RPC instead of inserting directly. New notification call sites MUST use `safe_create_notification` — never insert into `notifications` directly.

Tables: `notification_outbox`, `notification_dlq` — admin-readable only, system-writable.
