# ADR 0048 — Gumroad ingestion: real-time webhook primary, hourly self-healing backstop that alarms on any gap

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `supabase/functions/gumroad-backfill-all/index.ts`,
  `supabase/migrations/20260918120000_gumroad_backfill_hourly.sql`,
  `src/pages/ActivityLogPage.tsx`, `src/test/smoke/gumroad-backfill-all-observability.smoke.test.ts`,
  the ledger/projection (ADR-0037) and the `gumroad-webhook` real-time path.

## Context and problem statement

Membership recognition has two ingestion paths: the **real-time `gumroad-webhook`** (primary)
and a **poll-based `gumroad-backfill-all`** backstop that pulls the full Gumroad sales list.
On **2026-08-03** the Gumroad Ping was wired with the wrong `?secret=` — every event 403'd
(`malicious_webhook_signature_invalid` × 2, then abandoned) — so the real-time path went dark
and **100% of sales arrived only via the weekly backfill**. This went unnoticed for **~6 weeks**
because (a) the backstop ran only **weekly**, and (b) its completion was logged at **`info`**
regardless of how many sales it had to rescue. Members who paid didn't see their membership for
up to 7 days, and nothing alerted anyone.

The config bug itself is fixed in config (match the Ping secret to `GUMROAD_PING_SECRET`). This
ADR makes a *recurrence* surface within the hour instead of silently — as long as the hourly
backstop itself is running (which `environment_readiness()` monitors for presence + last-run
failure).

## Decision drivers

- **No silent failure.** The 6-week gap existed because a dark webhook produced no signal.
- **Fast self-heal.** Worst-case lag for a missed event should be an hour, not a week.
- **Honesty about the guarantee.** The trigger is an external system (Gumroad). We cannot
  guarantee delivery within a fixed time — an upstream outage is outside our control. What we
  *can* guarantee is: no silent loss, self-heal within the hour, and a visible alarm.
- Smallest change that delivers it.

## Decision outcome

Two small changes, no new infrastructure:

1. **The backstop is the detector.** `gumroad-backfill-all` upserts with `ignoreDuplicates`, so
   any row it *newly* creates (`ingested + pending`) is a sale the real-time webhook **missed**.
   It now emits **`gumroad_webhook_gap_detected` at `severity: error`** (labelled in the Activity
   Log) whenever that count is > 0 — a dark/mis-wired webhook screams instead of whispering.
2. **Weekly → hourly.** The cron runs at `:11` past every hour, bounding the detect + self-heal
   window to ≤ 1 hour. The pg_cron job **keeps its `gumroad-backfill-all-weekly` name** so that
   `environment_readiness()`'s expected-cron watchdog (and the fail-closed config-preflight gate)
   still match it — renaming would falsely report a "missing cron" and turn that gate permanently
   red. Adding a staleness (dead-man's-switch) threshold for the now-hourly job — moving its
   watchdog entry into the staleness-enforced list — is a focused follow-up on that function;
   until then it retains presence + last-run-failed coverage (`environment_readiness` checks 4 & 5).

The real-time webhook stays the primary path (sub-second when it fires; the projection trigger +
Supabase Realtime already push the membership to the member's open page). The backstop is now a
tight safety net that is *loud* when it has to catch anything.

## Consequences

**Good**
- A dark webhook is visible within the hour, not weeks — the exact failure that just happened
  can't recur silently.
- Missed sales self-heal within the hour instead of up to 7 days.
- Zero new infrastructure; reuses the existing backfill, cron, and audit/Activity-Log surfaces.

**Bad / accepted**
- Hourly full-list pulls hit the Gumroad API 24×/day. Fine at current volume (~1 page); at
  larger scale this should become a *delta* reconcile (recent sales only) rather than a full
  pull — a follow-up, noted here so it isn't forgotten.
- The alarm also fires the first time the backstop legitimately catches a genuinely-late
  webhook. Accepted: that *is* a real miss worth surfacing; a persistently-firing alarm means
  the webhook is actually down, which is the signal we want.
- This does not, and cannot, make external delivery itself guaranteed — it makes *our* handling
  of a gap non-silent and fast. That distinction is deliberate (see decision drivers).

## Confirmation

- `src/test/smoke/gumroad-backfill-all-observability.smoke.test.ts`: MEM-OBS-009 pins the hourly
  schedule + job name; MEM-OBS-010 pins that the backfill emits `gumroad_webhook_gap_detected` at
  `error` and that the Activity Log labels it.
- Operationally: once the Ping secret is fixed, new sales show `resource_name='sale'` with
  `received_at ≈ now`, and the gap alarm stays quiet. If the webhook ever goes dark again, the
  hourly run raises the alarm within the hour.
