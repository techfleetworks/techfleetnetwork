---
name: Lane 2 Self-Heal Recovery Logging
description: CircuitBreaker emits external_api_recovered to audit_log on HALF_OPEN→CLOSED probe success; surfaced in daily digest
type: feature
---
- New `reportRecovery(source, {attempts, durationMs})` in `src/services/error-reporter.service.ts`.
- Event type `external_api_recovered` (severity=info) added to ReportEventType union.
- `audit_event_policy` row: cap 5/min, dedup 300s — flapping deps cannot spam.
- `CircuitBreaker.onSuccess()` in HALF_OPEN lazy-imports the reporter and logs recovery with attempt count; tracked via private `recoveryAttempts` counter (reset on close).
- `triage-digest-builder` now counts `external_api_recovered` in the last 24h and surfaces "🔁 Self-recovered: N" alongside Pending/Proposed/Resolved.
- Cost: zero new infra; reuses audit_log + existing digest cron.
- BDD: TRIAGE-018 "Discord breaker probe success emits external_api_recovered" [UI digest line shows count / [DB] audit_log row event_type=external_api_recovered / [Code] CircuitBreaker.onSuccess invoked reportRecovery once.
