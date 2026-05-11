---
name: Triage Noise Suppression
description: Defense-in-depth rules that keep stale-chunk and aggregate observability events out of agent_fix_queue / Triage tab
type: feature
---

# Triage queue noise suppression

The Triage tab (System Health → Triage) is reserved for **actionable, severity=error code bugs**. Infrastructure / observability events (stale-chunk loads, aggregate suppression flushes, audit pressure transitions, self-heal recoveries) MUST NEVER appear there — they drown out real bugs and waste AI triage budget.

## Layers (defense in depth)

1. **Reporter classification** — `src/services/error-reporter.service.ts`
   - `installGlobalErrorReporter` runs `chunkAwareReport` on every window `error` and `unhandledrejection`. If `isChunkLoadMessage(msg)` matches, the event is logged as `event_type=ui_chunk_load_failed`, `severity=warn`. ErrorBoundary uses the same classifier.
   - Single source of truth for chunk-load detection: `isChunkLoadMessage` exported from `src/lib/lazy-with-retry.ts`.

2. **Reporter queue gate** — `writeAudit()`
   - `NON_ACTIONABLE_EVENT_TYPES = { client_error_overflow, client_error_suppressed, client_error_deduped, external_api_recovered, ui_chunk_load_failed, audit_pressure_changed }`
   - Skips the `upsert_fix_queue_entry` RPC when `severity !== 'error'` OR the event_type is in that set. Still writes to `audit_log` for observability.

3. **DB trigger** — `block_non_actionable_fix_queue_inserts` (BEFORE INSERT on `agent_fix_queue`)
   - Returns NULL (silently drops) for `severity <> 'error'` or any non-actionable `event_type`. Also protects against `discover_audit_fingerprints` and any future code path.

4. **Auto-discover exclusions** — `discover_audit_fingerprints` excludes the same six event types from the candidate scan.

5. **UI filter** — `TriageTab.tsx` query adds `.eq('severity','error')`.

6. **Known-issue catalog** — substring rules for "error loading dynamically imported module", "Failed to fetch dynamically imported module", "Importing a module script failed", "client error(s) suppressed by pattern", "duplicate client error(s) deduped" auto-silence anything that slips through reclassification.

## Rules when changing this code

- Do NOT remove `chunkAwareReport` from the global window listeners.
- Do NOT relax `skipQueue` in `writeAudit` to allow non-error severities.
- Do NOT drop the BEFORE INSERT trigger on `agent_fix_queue`.
- Do NOT remove the `.eq('severity','error')` filter from TriageTab.
- If a new infrastructure event_type is added, append it to BOTH `NON_ACTIONABLE_EVENT_TYPES` (TS) and `v_non_actionable` (PL/pgSQL trigger) and `v_excluded_events` (discover_audit_fingerprints).

## BDD coverage

- `TRIAGE-NOISE-004` — chunk-load never enters Triage [UI][DB][Code]
- `TRIAGE-NOISE-005` — aggregate suppression never enters Triage [UI][DB][Code]
- `TRIAGE-NOISE-006` — DB trigger blocks direct INSERTs [DB]
- `TRIAGE-UI-001` — Triage tab shows only severity=error rows [UI][DB][Code]
