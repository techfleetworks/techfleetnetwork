---
name: Self-Healing System Layer
description: Three-layer self-healing — error fingerprinting + Top-10 dashboard, an auto-remediation registry running pre-written cleanup functions on schedule, a system-health gauge that auto-pauses non-critical jobs, and a Discord role grant retry queue that drains on next login
type: feature
---

# Self-healing system architecture

## Layers

1. **Error fingerprinting** — `audit_log.error_fingerprint` (SHA-256 of normalized event/table/message) is computed by trigger. `get_top_error_fingerprints(hours, limit)` admin RPC returns grouped occurrences + affected users.

2. **Auto-remediation registry** — `system_remediations` table maps regex `signature_pattern` → allowlisted `remediation_function`. `run_auto_remediations()` runs every 2 min via pg_cron, checks if each rule's pattern still appears in the last 15 min, runs the function, logs result. Allowlist enforced by `is_remediation_allowed()`.

3. **System health gauge** — `system_health_state` singleton row updated every 1 min by `evaluate_system_health()`. Status thresholds: `healthy` → `degraded` (>25 errors/5min OR >10 stuck fanout OR >50 stuck outbox) → `overloaded` (>100/>50/>200) which sets `pause_non_critical=true`.

4. **Discord role retry** — failed grants in `manage-discord-roles` get queued via `queue_discord_role_grant()`. On user login, `useDiscordRoleRetry` hook drains pending grants (up to 5) with `mark_discord_role_grant_result` updating attempt/backoff state.

## UI
Admin-only `SystemHealthWidget` mounted at the bottom of `/dashboard`. Shows status pill, top 10 fingerprints (24h), remediation rules with run/success counts, and a manual "Run now" button.

## Allowlisted remediation functions
`cleanup_stuck_email_queue`, `cleanup_rate_limits`, `cleanup_passkey_login_artifacts`, `drain_notification_outbox`, `retry_stuck_fanout_jobs`, `retry_pending_discord_role_grants`, `evaluate_system_health`.

## Critical guardrails
- Remediations are **pre-written human-reviewed functions** — no AI auto-codegen at runtime.
- `is_remediation_allowed()` blocks any function not in the allowlist even if a row is inserted.
- Cooldowns prevent thundering-herd remediation loops.
- All runs logged to `audit_log` as `auto_remediation_run` events.
