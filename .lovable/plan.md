## Root cause

The `/events` page calls `get-community-events`, which reads the row in `public.community_events_cache`. That row is currently:

```
event_count = 0, last_refresh_status = NULL, fetched_at = NULL
```

The cache has **never been populated**. Confirmed:

- `refresh-community-events` edge function has **zero** invocation logs.
- `pg_net` queue has no entries pointing at `/functions/v1/refresh-community-events`.
- The Google ICS feed itself is healthy (8.4 MB, 6,599 VEVENTs returned in <1 s from the sandbox).

Why the cron never fires: the migration `20260510160618_*.sql` registered `cron.schedule('refresh-community-events', '*/10 * * * *', …)` calling `public.kick_community_events_refresh()`. That function does:

```sql
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url';
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key';
EXCEPTION WHEN OTHERS THEN RETURN;
IF v_url IS NULL OR v_key IS NULL THEN RETURN;
```

Other working crons in this project use **different** vault names — for example `email-queue-drain` uses `project_url` and `email_queue_service_role_key`. When the events kicker doesn't find `supabase_url` / `supabase_service_role_key`, it returns silently with no logs, no row update, no queue entry. Result: the cache stays empty forever and the UI correctly renders the "No upcoming events" empty state.

## Fix (permanent, three layers)

### 1. Make the kicker resilient and self-reporting (DB migration)

Rewrite `public.kick_community_events_refresh()` to mirror the pattern that already works for the email and push crons:

- Try multiple known secret names in order: `supabase_url`, `project_url`, then `current_setting('app.settings.supabase_url', true)`.
- Same for the service-role key: `supabase_service_role_key`, `email_queue_service_role_key`, then `current_setting('app.settings.service_role_key', true)`.
- If still missing, **write the failure into `community_events_cache`** (`last_refresh_status='config_error'`, `last_refresh_error='vault secrets missing'`) instead of silently returning. This guarantees visibility in the existing System Health surface.
- Keep `EXCEPTION WHEN OTHERS` but capture `SQLERRM` into `last_refresh_error` before returning, so any future regression shows up in the same place.
- After redefining, immediately `PERFORM public.kick_community_events_refresh();` so the first refresh runs as soon as the migration applies.
- Re-confirm the cron line `*/10 * * * *` is scheduled (idempotent).

### 2. Harden `refresh-community-events` (edge function)

Small reliability tweaks while we're here — none change the public output:

- On `last_refresh_status` writes, also stamp `event_count` to `0` when status flips to `error`/`config_error`, so admins can see staleness clearly.
- Add a JSON-line `console.info` at the start of the run (`{ stage: 'start', cacheAge_ms }`) — helps confirm cron actually fires next time.

### 3. Admin visibility on `/events` (frontend, admin-only)

The empty-state copy is correct for end-users — keep it. For admins, render a small in-page banner above the events list when `community_events_cache.last_refresh_status` is `error` or `config_error`, or when `fetched_at` is older than 30 min:

```
Calendar sync is failing — last attempt: <relative time>. Reason: <last_refresh_error>.
```

This way, the next time the cron breaks, an admin sees it immediately on the same page they're reading.

## Why this fixes it permanently

- The kicker no longer depends on a single secret name; it works in every vault layout this project has used.
- Failures stop being silent — they land in the same row the read path already inspects, and surface as an admin banner on `/events`.
- The migration triggers an immediate refresh, so admins (and users) see the 38 events this week within seconds of the migration applying, not on the next 10-min tick.

## BDD scenarios (added to `bdd_scenarios`)

- `EVENTS-SYNC-001` — When the kicker runs and vault secrets are present, the cache is populated within 30 s and the API returns ≥1 event.  
  Then [DB] `community_events_cache.event_count > 0` and `last_refresh_status='ok'`. [Code] `get-community-events` returns 200 with non-empty `events`. [UI] `/events` renders cards instead of the empty state.
- `EVENTS-SYNC-002` — When vault secrets are missing, the cache row records `config_error` and admins see the failure banner.  
  Then [DB] `last_refresh_status='config_error'`. [Code] `get-community-events` still returns 200 (graceful). [UI] admin sees the red banner; non-admin still sees the friendly empty state.

## Files touched

- New migration: redefine `kick_community_events_refresh`, re-schedule cron, run once.
- `supabase/functions/refresh-community-events/index.ts` — minor logging + status hardening.
- `src/components/events/CommunityEventList.tsx` (or new sibling) — admin-only stale/error banner; reads cache metadata via a tiny new RPC `public.get_community_events_health()` that returns `{ last_refresh_status, last_refresh_error, fetched_at }`.
- `bdd_scenarios` insert for `EVENTS-SYNC-001` and `EVENTS-SYNC-002`.

No user-visible regressions. The end-user empty-state stays untouched; the admin banner only appears when there's something to fix.
