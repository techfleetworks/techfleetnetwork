---
name: Dead Client Sources Lookup
description: Server-side suppression of telemetry from removed client features still firing from cached stale browser bundles
type: feature
---
When a client component is removed from the codebase, residual stale-browser-bundle traffic keeps reporting `client_error` rows from that source. To stop the noise without requiring every user to refresh:

- **Lookup table:** `public.dead_client_sources(source PK, reason, added_at)`. Admin-only RLS via `has_role(...,'admin')`. Add new entries via direct INSERT.
- **Trigger:** `audit_log_drop_dead_sources_t` BEFORE INSERT on `audit_log` returns NULL for any `client_error` / `client_error_suppressed` / `client_error_deduped` row whose `changed_fields` contains `source:<dead-source>`. Returning NULL means the row is never persisted, so the SOC 2 hash chain is unaffected (no rotation rule violated).
- **Belt-and-suspenders:** `upsert_fix_queue_entry` early-returns NULL when `p_source` is in the lookup, preventing Triage tickets even if a server-side caller bypasses the audit_log trigger.
- **Client mirror:** `SUPPRESSED_PATTERNS` in `src/services/error-reporter.service.ts` includes the same source strings, and `isSuppressed` now runs inside `reportToAuditLog` (not just `reportError` + global handlers) so every reporter path is guarded — closes the historical bypass that let `SupportWidget.token` flood audit_log.
- **Stale-tab nudge:** When the reporter sees a `FunctionsFetchError` (or any pattern starting with a dead source), it calls `deployWatcher.checkNow()` (throttled to 1/10s) so a stuck tab reloads on the next idle window instead of firing dozens of retries.

**How to add a new dead source:** `INSERT INTO public.dead_client_sources (source, reason) VALUES ('<source-string>', '<why>');` — no app deploy needed.

**Seeded:** `SupportWidget.token` (Chatwoot prototype removed May 2026).

**BDD:** `DEAD-CLIENT-SOURCE-001` in `bdd_scenarios`.
