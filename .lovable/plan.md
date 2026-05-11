## Goal

Resolve every open item in the Triage queue and Silent Failures tab, and stop the upstream noise sources so they don't refill.

## Current state (from DB)

**Triage queue (open fingerprints):**
| # | Event | Source | Count | Real cause |
|---|---|---|---|---|
| 1 | `client_error` "Failed to count progress" | `query.journey-completed.*` (×3 fingerprints) | 4 | `getCompletedCount` rethrows on transient PostgREST/network blips; React Query `onError` reports them as severity=error |
| 2 | `audit_pressure_changed` (×2 fingerprints) | `system_health_state` | 2 | `discover_audit_fingerprints` hardcodes `severity='error'` for **every** audit_log row that has an error_message + fingerprint, including informational state-transition events |

**Silent Failures (last 7 days):**
| Event | Count | Real cause |
|---|---|---|
| `ui_render_error` "error loading dynamically imported module: NetworkActivity-…js" | 156 | `ErrorBoundary.componentDidCatch` reports a chunk-load error as `ui_render_error/error` once `sessionStorage.__lovable_chunk_reload__` is set (i.e. after the one-shot reload) instead of the existing `ui_chunk_load_failed/warn` event |
| `client_error` "TypeError: Failed to fetch" | 133 | Already in `SUPPRESSED_PATTERNS`, but the matching is case-sensitive and the substring still leaks through some edge function client paths |
| `client_error_deduped` | 17 | Working as intended, just noisy in the silent-failures view |
| `external_api_failed` (sample = nil) | 2 | `discord-fetch` rare path emits the event with no message |

## Changes

### 1. ErrorBoundary — stop reporting chunk-load as `ui_render_error`

`src/components/ErrorBoundary.tsx`
- When `isChunkError` is true and we've already used the reload flag (so we fall through to reporting), report it as `ui_chunk_load_failed` with `severity: "warn"` (matches `lazy-with-retry`), not `ui_render_error/error`.
- Result: no new `ui_render_error` rows for stale-chunk events, and the warn-tier rows aren't promoted to the Triage queue (queue keeps `severity='error'` filter via known-issue catalog).

### 2. Add stale-chunk filename to known-issue catalog and dismiss historical rows

New migration:
- `INSERT … known_issue_catalog` rules:
  - `match_kind=substring`, `pattern='error loading dynamically imported module'`, `event_type_filter='ui_render_error'`, reason "Stale-bundle chunk-load — handled by lazy-with-retry hard reload."
  - `match_kind=substring`, `pattern='Failed to fetch dynamically imported module'`, same filter.
- `UPDATE agent_fix_queue SET status='dismissed', dismissed_reason='Stale-chunk noise — see known_issue_catalog' WHERE status IN ('pending','triaged','proposed') AND error_message ILIKE '%dynamically imported module%';`

### 3. `getCompletedCount` — don't escalate transient errors

`src/services/journey.service.ts`
- Import `isTransientError` from `@/lib/transient-error`.
- When the PostgREST error is transient, throw a `TransientError`-shaped error (re-export a small marker class, or set `error.name = "TransientQueryError"`) so the global `QueryCache.onError` can downgrade it.

`src/App.tsx` (`queryCache.onError`)
- If `isTransientError(error)` OR `error.name === "TransientQueryError"`: report at `severity: "info"` with `eventType: "client_error_deduped"` (already a known noise bucket) **or** skip reporting entirely (preferred — transient query errors aren't actionable).

### 4. `discover_audit_fingerprints` — preserve original severity, exclude info events

New migration replacing the function:
- Add `MAX(severity)` (or sample one value) to the SELECT and pass it through.
- Skip rows whose original event_type is in a non-actionable allow-list: `audit_pressure_changed`, `external_api_recovered`, `client_error_deduped`, `client_error_suppressed`, plus any event whose original severity is `info`.
- Insert with that severity instead of hardcoded `'error'`.

Also dismiss the two existing `audit_pressure_changed` queue rows.

### 5. `email-pipeline-health` — emit `audit_pressure_changed` at info severity

`supabase/functions/email-pipeline-health/index.ts`
- The `write_audit_log` RPC supports a severity param; pass `p_severity = 'info'` for the state-transition write so it never matches discovery in the first place. (Belt + suspenders with #4.)

### 6. `external_api_failed` empty-message guard

`supabase/functions/_shared/discord-fetch.ts`
- Ensure `error_message` is always a non-empty string (`err?.message || \`Discord ${method} ${url} failed (no message)\``) so silent-failures rows aren't `<nil>`.

### 7. BDD coverage

New `bdd_scenarios` rows:
- `TRIAGE-NOISE-001` Stale-chunk error never enters Triage queue (UI: no row appears; DB: known_issue_catalog match excludes it; Code: ErrorBoundary reports `ui_chunk_load_failed/warn`).
- `TRIAGE-NOISE-002` Transient PostgREST failure inside `getCompletedCount` is silenced (UI: no Triage row; DB: no audit_log error written; Code: `QueryCache.onError` short-circuits on `isTransientError`).
- `TRIAGE-NOISE-003` `audit_pressure_changed` events never become triage tickets (UI: queue empty for that event_type; DB: discover_audit_fingerprints filters by severity; Code: write_audit_log called with severity=info).

## Verification

1. After deploy + migration, run `SELECT count(*) FROM agent_fix_queue WHERE status='pending';` — expect 0 (or only genuinely new errors).
2. Run `SELECT * FROM get_top_silent_failures(168, 25);` as service role — expect `ui_render_error` count to stop growing on the next page load that hits a stale chunk.
3. Open Triage tab → "No open errors. Nice." empty-state.
4. Open Silent Failures (24h) → only genuine non-suppressed events remain.

## Out of scope

- Retroactively pruning historical `audit_log` rows (carve-out: audit log is append-only).
- The dynamic chunk-resolution issue itself — `lazy-with-retry` already handles it.
- Refactoring the Triage UI components (their behavior is correct; only the upstream signal is noisy).
