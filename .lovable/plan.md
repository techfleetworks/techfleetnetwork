## Root Cause (verified)

The 55 `SupportWidget.token` warns are **stale-browser-bundle noise from a deleted feature**:

1. `SupportWidget` was a Chatwoot prototype that was deleted — zero references remain in `src/` today.
2. **5 distinct users** still have old `index.html` cached, which loads old chunks containing the SupportWidget code. One user alone fired **48 of the 55 warns in a 40-minute window** (a chronic stuck tab retrying the dead token call).
3. The old SupportWidget catch handler logs via `reportToAuditLog` / `writeAudit` directly — **bypassing the existing `isSuppressed` filter** (which is only called from `reportError` and the global handlers, not from internal `reportToAuditLog`).
4. Each warn lands in `audit_log` as `client_error` with `changed_fields={source:SupportWidget.token, severity:warn}` and message `FunctionsFetchError: Failed to send a request to the Edge Function`.
5. Prior migrations (May 10) dismissed the `agent_fix_queue` rows but new fingerprint variants keep re-opening tickets, so the noise loops back into Triage.

A new client deploy alone won't fix it — those tabs are running code that pre-dates the suppression list. We need a **server-side bullet** plus client-side defense in depth.

## Permanent Fix — Defense in Depth

### Layer A (server bullet) — Drop dead-source rows at `audit_log` insert time

New `dead_client_sources` lookup table (seedable) + `BEFORE INSERT` trigger on `audit_log` that returns `NULL` for matches. This silently drops the row before it touches the hash chain (no chain breakage — the row was never inserted, no rotation rule violated).

```sql
create table public.dead_client_sources (
  source text primary key,
  reason text not null,
  added_at timestamptz not null default now()
);
insert into public.dead_client_sources values
  ('SupportWidget.token', 'Chatwoot prototype removed; residual stale-bundle noise.');

create or replace function public.audit_log_drop_dead_sources()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.event_type = 'client_error'
     and exists (
       select 1 from public.dead_client_sources d
       where ('source:'||d.source) = any(new.changed_fields)
     ) then
    return null;  -- silently drop
  end if;
  return new;
end $$;

create trigger audit_log_drop_dead_sources_t
before insert on public.audit_log
for each row execute function public.audit_log_drop_dead_sources();
```

This kills the noise from **every version of every client, today**. Adding a future dead source = single `INSERT` into the lookup, no app deploy.

### Layer B — Block `agent_fix_queue` reopens for dead sources

Update `upsert_fix_queue_entry` to early-return `NULL` when `p_source` is in `dead_client_sources`. Belt-and-suspenders so even if a server-side caller bypasses the audit trigger, Triage stays clean.

### Layer C — Tighten the client suppression list (live bundles only)

In `src/services/error-reporter.service.ts`:

1. Move `isSuppressed(msg)` from `reportError` into the shared `reportToAuditLog` so **every reporter path** is guarded (not just `reportError` + global handlers). This closes the bypass that originally let SupportWidget through.
2. Add `"SupportWidget.token"` and a generic `"source:SupportWidget"` to `SUPPRESSED_PATTERNS` for symmetry.

### Layer D — Nudge stuck stale tabs to reload faster

In the error reporter, when a `FunctionsFetchError` arrives whose source is in a known-dead-source set, call `deployWatcher.checkNow()` synchronously. The deploy-watcher already reloads on version mismatch — this turns "48 retries before someone refreshes" into "1 retry → version check → reload to fresh build".

### Layer E — Observability (drops are not a black hole)

The trigger increments a `pg_stat_statements`-friendly counter via the existing `client_error_suppressed` audit event (one row per minute, not per drop). The daily Triage digest already surfaces these counts, so we'll know if the dead-source list ever needs pruning.

## Files / Migrations

| Layer | File |
|---|---|
| A + B | New migration: `dead_client_sources` table, `audit_log_drop_dead_sources` trigger, `upsert_fix_queue_entry` guard, seed row for `SupportWidget.token` |
| C | `src/services/error-reporter.service.ts` — move `isSuppressed` into `reportToAuditLog`; add patterns |
| D | `src/services/error-reporter.service.ts` — call `deployWatcher.checkNow()` on dead-source FunctionsFetchError; export `checkNow` from `src/lib/deploy-watcher.ts` if not already |
| Tests | `src/test/services/error-reporter.test.ts` (new): suppression bypass regression test for `reportToAuditLog`; `supabase/tests/dead_sources.sql`: trigger drops the row |
| BDD | Update `bdd_scenarios.HEALTH-TRIAGE-FIX-001` with a tri-layer scenario for dead-source suppression: UI unchanged, DB rows dropped, code path guarded |
| Memory | Append rule to `mem://features/error-triage-queue` covering `dead_client_sources` lookup |

## Verification

1. After migration: `INSERT INTO audit_log` with `event_type='client_error'`, `changed_fields={'source:SupportWidget.token'}` — verify row count unchanged.
2. Audit poll 24h post-deploy: `client_error` rows with source `SupportWidget.token` = 0; daily digest shows N drops via `client_error_suppressed`.
3. `agent_fix_queue` no `SupportWidget.token` rows in `pending` state.
4. Deploy-watcher reload behavior: the user with the stuck tab reloads on next route change instead of firing 48 retries.

## Audit notes (other warns to triage in same loop)

- The "5 Failed to load announcements" errors are transient `useAnnouncements` query failures during the same May-10 deploy windows — not actionable code-side; they're already covered by the `network_failure` rate-limit class. No fix needed unless they recur.
- Edge function `record-web-vital` shows healthy boot/shutdown patterns; no failures.
- `public-project-openings` warns about `SUPABASE_SERVICE_ROLE_ROTATED_AT not set` — separate runbook (`docs/runbooks/jwt-rotation.md`); out of scope here.