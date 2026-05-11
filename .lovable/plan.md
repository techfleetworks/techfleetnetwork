# Why these are showing in Triage

Tracing the three items the user pasted back through the codebase + DB:

1. `TypeError: error loading dynamically imported module: .../NetworkActivity-*.js`
   (source: `ErrorBoundary:/dashboard`, event_type `ui_render_error`, severity `error`)
   - Created **before** the previous fix that downgrades chunk-load errors to `warn`. Already `dismissed` in the queue, but the Triage tab still surfaces it because of the `severity` filter design (see #4).

2. `TypeError: error loading dynamically imported module: .../NetworkActivity-*.js`
   (source: `lazy-with-retry`, event_type `ui_chunk_load_failed`, severity `warn`, status `triaged`)
   - This row is *correct* in severity (`warn`), but `writeAudit()` still pushes it into `agent_fix_queue`, and the AI auto-triager picks it up. Stale-chunk noise should never reach the queue.

3. `4 client error(s) suppressed by pattern "TypeError: Failed to fetch"`
   (source: `error-reporter.suppression`, event_type `client_error_suppressed`, severity `warn`, status `triaged`)
   - This is the aggregate observability flush meant only for /admin/system-health metrics. `writeAudit()` is also forwarding it to `agent_fix_queue` and the AI auto-triager invents a "fix" for it.

### Two real bugs in `src/services/error-reporter.service.ts`

- `writeAudit()` `skipQueue` rule only excludes `severity === 'info'` and `event_type === 'client_error_overflow'`. Every other infrastructure / aggregation event lands in Triage.
- `installGlobalErrorReporter()` (window `error` + `unhandledrejection`) does **not** detect chunk-load errors. When a Suspense lazy import rejects, the rejection bubbles to `unhandledrejection` BEFORE ErrorBoundary's downgrade logic, so it gets logged as `client_error` severity `error` and is a first-class Triage citizen. (This is why the historical `client_error` count is 77 with chunk strings inside.)

### One UX bug in Triage UI

`src/components/system-health/TriageTab.tsx` lists every status in `(pending, triaged, proposed)` with no severity filter, so warn-level infra events show alongside actionable error-level bugs.

---

# Plan

## 1. `src/services/error-reporter.service.ts` — keep noise out of the queue

- Add a module-level constant `NON_ACTIONABLE_EVENT_TYPES = new Set(['client_error_overflow', 'client_error_suppressed', 'client_error_deduped', 'external_api_recovered', 'ui_chunk_load_failed', 'audit_pressure_changed'])`.
- In `writeAudit()`, change `skipQueue` to also skip when `NON_ACTIONABLE_EVENT_TYPES.has(args.eventType)` OR `args.severity !== 'error'`. Aggregated/infra events still write to `audit_log` (admins can see them on System Health), but never enter `agent_fix_queue`.
- In `installGlobalErrorReporter()`, before calling `reportToAuditLog`, run a shared `classifyChunkError(msg)` helper. If it matches the chunk-load patterns from `lazy-with-retry.ts` (extract them into a new exported `isChunkLoadMessage(msg)` so all three call sites agree), report with `eventType: 'ui_chunk_load_failed'` and `severity: 'warn'`. Apply to both the `error` and `unhandledrejection` listeners.
- Same classifier in `ErrorBoundary.componentDidCatch` — replace its inline regex with the shared helper.

## 2. `src/lib/lazy-with-retry.ts` — export the classifier

- Export `isChunkLoadMessage(msg: string): boolean` and refactor `isChunkLoadError` to call it. Single source of truth across ErrorBoundary, lazy-with-retry, and the global reporter.

## 3. `src/components/system-health/TriageTab.tsx` — only surface actionable errors

- Add `.eq('severity', 'error')` to the queue query so warn/info infra events never appear in Triage even if they slip through. Add a small "Show warnings" toggle (default off) for admins who want them.

## 4. Database migration — defense in depth + cleanup

- Update `discover_audit_fingerprints` to also exclude `client_error_suppressed`, `client_error_deduped`, `audit_pressure_changed`, `ui_chunk_load_failed`, `external_api_recovered`, `client_error_overflow` (some are already excluded — confirm and add the missing ones).
- Add a `BEFORE INSERT` trigger on `agent_fix_queue` (`block_non_actionable_fix_queue_inserts`) that raises `EXCEPTION USING ERRCODE = 'check_violation'` if `severity <> 'error'` OR `event_type IN (... non-actionable list ...)`. Belt-and-suspenders so a future code path can't reintroduce the bug.
- Auto-dismiss the existing matching rows (the two `client_error_suppressed` rows + the `ui_chunk_load_failed` row + the historical `ui_render_error` chunk row) with `dismissed_reason = 'auto-dismissed: non-actionable infra event (perm fix 2026-05-11)'`.
- Insert one `known_issue_catalog` rule per `event_type` so any future leak is auto-dismissed.

## 5. BDD scenarios in `bdd_scenarios`

- `TRIAGE-NOISE-004`: chunk-load error from any path (ErrorBoundary, lazy-with-retry, window error, unhandledrejection) → `audit_log` row at `severity=warn`, `agent_fix_queue` count unchanged. [UI][DB][Code]
- `TRIAGE-NOISE-005`: `client_error_suppressed` flush → `audit_log` row written, `agent_fix_queue` count unchanged. [UI][DB][Code]
- `TRIAGE-NOISE-006`: trigger rejects direct INSERT of warn-severity row into `agent_fix_queue`. [DB]
- `TRIAGE-UI-001`: TriageTab renders only `severity='error'` rows by default. [UI]

## 6. Verification

- After deploy, query: `select count(*) from agent_fix_queue where event_type in (...) and status in ('pending','triaged','proposed');` → expect 0.
- Manually trigger a 404 on a chunk URL via DevTools Network throttling, confirm no new `agent_fix_queue` row is created.

---

## Out of scope (not the cause)

- Fixing why the chunk 404s in the first place — `lazyWithRetry` already retries twice + hard-reloads; deploy-watcher already pre-empts most cases. The chunk fetch failing during a deploy window is expected and self-healing; the bug is that we were *logging it as an actionable error*.
- Touching the i18n runtime translator from the previous turn.

## Files touched (technical)

- `src/services/error-reporter.service.ts`
- `src/lib/lazy-with-retry.ts`
- `src/components/ErrorBoundary.tsx`
- `src/components/system-health/TriageTab.tsx`
- `supabase/migrations/<new>.sql`
