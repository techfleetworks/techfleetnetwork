## Why these 5 errors happen

The triage entry `client_error::query.announcements.latest.20::Error: Failed to load announcements.` is fired from `AnnouncementService.list()` (src/services/announcement.service.ts:32) every time the **`useLatestAnnouncements`** hook polls and the supabase-js call returns an error.

That hook polls **every 30s**, on every authenticated tab, with `refetchOnWindowFocus: true`. Realistically, ~5 transient PostgREST/network failures per day across the entire user base is the floor: brief 502/503 from PostgREST, DNS hiccups, mobile radios switching, VPN reconnects. The earlier fix only suppressed `AbortError`; everything else still:

1. Throws `"Failed to load announcements."` from the service layer
2. Gets reported to `audit_log` + `agent_fix_queue` as `client_error` severity=`error`
3. Cannot be auto-fixed by triage because there is no code bug — it is a transient infra event

Result: the queue accumulates an unactionable "5 occurrences" entry that drowns out real signal, and there is no graceful degradation in the UI either.

## Goal

Treat transient fetch failures on the announcement poll the same way we treat AbortError: **silently keep last-known-good data**, only escalate to triage when the failure is sustained or structural (auth/RLS/schema). No user-facing toast, no UI flicker, no triage spam.

## Plan

### 1. Service layer — classify and degrade (`src/services/announcement.service.ts`)

Replace the unconditional throw in `list()` with an error classifier:

- **Transient** (network/timeout/5xx/PostgREST 503 / `Failed to fetch` / connection-reset): do **not** throw. Log at `warn`. Return last-known-good announcements from a module-level LRU keyed by `limit` (the existing graceful-degradation pattern in `mem://tech/graceful-degradation`). If no cache, return `[]`.
- **Structural** (RLS denial 401/403, schema 42P01/42703, auth missing): throw the existing `"Failed to load announcements."` so it lands in triage where it belongs.

A tiny `transient-classifier.ts` helper (already partially encoded in `error-reporter.service.ts` SUPPRESSED_PATTERNS) is hoisted into `src/lib/transient-error.ts` so other polling services (notifications, network activity) can reuse it later. **No call sites change.**

### 2. Hook layer — keep last data + back off (`src/hooks/use-announcements.ts`)

`useLatestAnnouncements` and `useAnnouncementReadIds`:

- Add `placeholderData: (prev) => prev` (keepPreviousData) so transient empties never blank the bell.
- Add `retry: (failureCount, err) => failureCount < 2 && isTransient(err)` with exponential backoff (1s, 4s).
- Lift `refetchInterval` to 60s (was 30s) — the bell already revalidates on focus and on `INSERT` realtime; 30s polling is excess load that doubled the transient failure rate.

### 3. Reporter layer — sustained-failure debounce (`src/services/error-reporter.service.ts`)

Add a per-fingerprint **"escalate-after-N"** rule for the announcements polling fingerprint:

- First `N-1` (default 3) failures inside a 5-minute window → counted in `client_error_suppressed` aggregate only.
- Nth failure inside the window → escalates as a normal `client_error` so admins still see structural outages.

This is generic — keyed by event_type+source pattern from a new column on `audit_event_policy` (`min_occurrences_before_escalate INT DEFAULT 1`). We seed `query.announcements.latest.*` to `3`.

### 4. DB migration

```sql
ALTER TABLE public.audit_event_policy
  ADD COLUMN IF NOT EXISTS min_occurrences_before_escalate INT NOT NULL DEFAULT 1;

INSERT INTO public.audit_event_policy
  (event_type_pattern, cap_per_minute, dedup_window_seconds, min_occurrences_before_escalate)
VALUES
  ('client_error::query.announcements.%', 5, 300, 3)
ON CONFLICT (event_type_pattern) DO UPDATE
  SET min_occurrences_before_escalate = EXCLUDED.min_occurrences_before_escalate;
```

`get_audit_policy` RPC already returns the row — extend the SELECT list with the new column. Frontend `PolicyEntry` gains `minOccurrencesBeforeEscalate`.

### 5. One-time cleanup

Resolve the 3 stale `agent_fix_queue` rows for this fingerprint (mark `status='dismissed'`, `dismissed_reason='replaced by graceful degradation in use-announcements + service classifier'`) so the queue is honest about open work.

### 6. BDD scenarios (required by workspace policy)

Insert into `bdd_scenarios`:

- **ANN-RESILIENCE-001** — Given the announcement bell is mounted, When PostgREST returns 503 once, Then [UI] the bell still shows the previously cached items, [DB] no row is written to `agent_fix_queue` for `query.announcements.latest`, [Code] `AnnouncementService.list` returns the cached array and logs at warn.
- **ANN-RESILIENCE-002** — Given the bell is mounted, When PostgREST returns 503 four times in five minutes, Then [UI] cached items still render, [DB] one `agent_fix_queue` row exists with severity=error, [Code] `reportError` is called exactly once on the 4th failure.
- **ANN-RESILIENCE-003** — Given the bell is mounted, When PostgREST returns 401 (RLS), Then [UI] empty state, [DB] `agent_fix_queue` row exists immediately with severity=error, [Code] `AnnouncementService.list` throws on the first failure.

## Files touched

- `src/services/announcement.service.ts` — classifier + LRU cache + conditional throw
- `src/lib/transient-error.ts` — **new** shared classifier
- `src/hooks/use-announcements.ts` — keepPreviousData, retry, 60s poll
- `src/services/error-reporter.service.ts` — escalate-after-N
- `supabase/migrations/<ts>_announcements_resilience.sql` — policy column + seed
- `supabase/migrations/<ts>_dismiss_announcements_triage_rows.sql` — cleanup
- `bdd_scenarios` table — 3 inserts

## Not in scope

- No change to the announcements table, RLS, or write paths.
- No change to `AnnouncementBanner` or `UpdatesPage` rendering — they read the same hook output.
- No change to email send pipeline (separate concern).

## Risk / rollback

Pure additive change. If the classifier mis-categorizes a real outage as transient, the worst case is a 60s delay before the 4th failure escalates — still better than today's noise. Rollback = revert the two migrations + three TS files.
