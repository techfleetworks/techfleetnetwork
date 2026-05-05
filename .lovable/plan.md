# Audit Log Coverage — All 5 Layers

Approved scope. Implementation will land in this order, with one critical bug-fix added in Layer 1 discovered during exploration.

## Critical bug found during exploration
`error-reporter.service.ts` calls `write_audit_log` with `p_user_id = "00000000-0000-0000-0000-000000000000"` when no user is known. The RPC rejects any non-null `p_user_id ≠ auth.uid()` with "Cannot write audit events for another user", so authenticated `client_error` writes have been silently failing — explaining the 6 events in 7 days. Fix: pass `null` (or the real `auth.uid()`) instead of a sentinel UUID.

## Layer 1 — Frontend instrumentation
- New `src/lib/trace.ts`: `newTraceId`, `withTrace`, `getCurrentTraceId`.
- Refactor `src/services/error-reporter.service.ts`:
  - Fix nil-UUID bug → pass `null` when unknown.
  - Add `severity` ("warn"/"error") and `traceId` fields, stored in `changed_fields` (`severity:error`, `trace:<id>`).
  - On rate-limit drop, queue a single `client_error_overflow` with suppressed count per minute.
- Extend `src/lib/service-result.ts` `handleServiceError` to also call `reportError(error, action, { severity: level })`.
- New `src/integrations/supabase/audited-invoke.ts` thin wrapper around `supabase.functions.invoke` that adds `x-trace-id` header and audits non-2xx errors.
- New `src/lib/audited-query.ts`: a global `QueryCache` / `MutationCache` with `onError` that calls `reportError(error, queryKey.join("."))`. Wire into `App.tsx` QueryClient.
- `src/components/ErrorBoundary.tsx`: emit dedicated `ui_render_error` event (not generic client_error) with route + component-stack hash.
- `src/lib/lazy-with-retry.ts`: emit `ui_chunk_load_failed` after final retry / before reload.
- `src/components/IdleTimeoutGuard.tsx`: log `session_idle_timeout` via `logAccountActivity` before sign-out.
- `src/hooks/use-push-notifications.ts`: log `push_subscribe_failed` / `push_permission_denied` / `push_unsubscribe_failed`.
- `src/lib/service-worker.ts` + caller in main: emit `sw_recovered` / `sw_failed` events.
- BDD scenarios row inserted to `bdd_scenarios` for "audit_log_coverage_layer1".

## Layer 2 — Edge function audit middleware
- New `supabase/functions/_shared/audit.ts`:
  - `auditEdgeEvent(adminClient, { event, table, recordId?, userId?, traceId, fields?, errorMessage? })` wraps `write_audit_log` (service-role bypass) so any function can fire events without re-implementing.
  - `wrapHandler(fn, handler)` middleware: extracts `x-trace-id` (or generates one), catches throws, emits `edge_function_error`, returns 500 JSON. Adds `x-trace-id` to response.
- Update `supabase/functions/_shared/request-auth.ts`:
  - On 401/403, call `auditEdgeEvent` with `authn_unauthorized` / `authz_admin_denied`.
- Update `supabase/functions/_shared/discord-fetch.ts`: on final retry exhaustion, fire `external_api_failed` (provider=discord).
- Update `supabase/functions/_shared/transactional-email.ts` (Resend wrapper) — same.
- Update `supabase/functions/gumroad-webhook/index.ts`: signature failure → `malicious_webhook_signature_invalid`.
- Apply `wrapHandler` to: `promote-to-admin`, `promote-to-teacher`, `admin-purge-auth-user`, `admin-sign-out-all-users`, `manage-discord-roles`, `confirm-admin-role`, `confirm-teacher-role`, `revoke-teacher-role`, `revoke-user-sessions`, `notify-applicant-status`, `mark-interview-scheduled`, `send-transactional-email`, `send-announcement-email`, `send-push-notification`, `process-email-queue`, `process-notification-fanout`, `gumroad-webhook`, `gumroad-reconcile`, `gumroad-backfill`, `quest-nudge`, `resend-signup-confirmations`, `email-pipeline-health`, `discord-interactions`, `discord-notify`, `discord-project-update`, `generate-discord-invite`, `resolve-discord-id`, `fetch-class-certifications`, `fetch-project-certifications`.
- BDD scenarios for "audit_log_coverage_layer2".

## Layer 3 — DB triggers
- Migration: trigger on `email_send_log` AFTER UPDATE OF status / AFTER INSERT — when new status ∈ (`failed`,`dlq`,`bounced`,`complained`), insert audit_log row `email_send_failed` with template, message_id, error_message.
- Verify `safe_create_notification` already emits `notification_dlq_moved`; if missing, add it.
- Add `app.trace_id` GUC capture: `write_audit_log` reads `current_setting('app.trace_id', true)` and prepends to changed_fields when present.

## Layer 4 — Trace correlation
- Frontend: every `auditedInvoke` call wraps in `withTrace`; mutation cache `onMutate` calls `withTrace`.
- Headers: `x-trace-id` on every edge invoke; edge `wrapHandler` reads it and threads through `auditEdgeEvent`.
- DB: edge functions, before mutating, set `app.trace_id` via `select set_config('app.trace_id', $1, true)` so triggers inherit. (Optional Phase-2 — only do if cheap.)

## Layer 5 — Surfacing
- `src/pages/ActivityLogPage.tsx`:
  - Add **Layer** filter (frontend / edge / db / auth) inferred from event_type prefix or table_name.
  - Add **Severity** filter (info / warn / error) using `severity:` field or destructive variant.
  - Add **Trace ID** search (matches `trace:<id>` in changed_fields).
  - Render the trace id as a clickable chip that filters to the same trace.
  - New `EVENT_TYPE_CONFIG` entries for the new event names.
- `src/pages/SystemHealthPage.tsx`: new "Silent Failures" tab + RPC `get_top_silent_failures(hours)` that buckets `*_failed`, `client_error*`, `edge_function_error`, `ui_*` from last N hours.

## Out of scope (next phase)
- Server-side ingestion of Core Web Vitals.
- Sampling when audit_log volume > 100k/day.
- PII redaction review of the new event payloads.

Order: 1 → 2 → 4 → 3 → 5. Single PR per layer.
