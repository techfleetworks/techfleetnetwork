---
name: Audit Log Retention Carve-Out
description: audit_log is a failure + security + privileged-action ledger, not a CRUD activity stream; existing rows are never pruned in place
type: feature
---

# Audit Log Retention Carve-Out

## Scope (as of May 2026 — Ledger, not Stream)
`audit_log` is a **failure + security + privileged-action ledger**, not a CRUD activity stream.
Routine inserts/updates on user-owned tables (notifications, chat_messages, journey_progress,
announcement_views/reads, profile avatar/bio edits, application bio/notes edits, etc.) are
**not logged** — the source tables are authoritative.

What is always logged:
- All `*_failed` / `*_error` events (client_error, edge_function_error, external_api_failed,
  ui_render_error, ui_chunk_load_failed, notification_dlq_moved, email_send_failed, etc.)
- Auth: signup/login/signout/password_reset/captcha/MFA challenges and failures
- Authz denials, role grants/revokes
- `profiles` updates **only** on `email`, `role`, `is_active`, `deleted_at`, `mfa_enrolled_at`
- `general_applications` / `project_applications` updates **only** on `status` transitions
- All `_delete` events on every table (destructive ⇒ always logged)
- Email pipeline operational events (sent / queued / suppressed / unhealthy)
- Discord webhook signature failures, role grant failures
- Admin actions (impersonation, sign-out-all, manual resends, bulk operations)

## Retention / Integrity (unchanged)
- Existing rows are **never pruned in place**. Hash-chain stays unbroken.
- DELETE-block trigger remains on `audit_log`.
- SOC 2 / ISO 27001 / HIPAA require privileged-action, auth, security-denial,
  failure, and deletion logging — all retained. Routine activity logging is not required.
- Future archive-then-prune workflow only (cold storage with hash-chain attestation).

## Cost Posture
- Steady-state target: ~300–600 rows/day (down from ~5,000/day pre-May 2026).
- Worst-case burst capped at ~5k/day via `audit_event_policy` per-event caps + dedup
  windows for the new Layer 1–5 error events.
- Pressure (`none|soft|medium|hard`) is computed by the existing
  `email-pipeline-health` cron and stored in `system_health_state.metadata.audit_pressure`.
  Writers tighten caps proportionally (1×, 0.66×, 0.33×, 0.1×).

## Reversibility
Pruned triggers are dropped, not deleted — re-attaching them is a single migration if
a compliance review ever requires re-enabling CRUD-stream logging on a specific table.
