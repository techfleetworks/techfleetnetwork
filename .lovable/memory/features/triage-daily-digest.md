---
name: Triage Daily Digest
description: pg_cron at 15:00 UTC runs triage-digest-builder; one Discord post + one email per admin per day, quiet-day guard
type: feature
---

# Triage Daily Digest

## Purpose
Give admins a once-a-day picture of platform errors without watching the
System Health page. Built on the existing **Error Triage Queue** (`agent_fix_queue`).

## Trigger
- pg_cron job `triage-digest-daily` at `0 15 * * *` (15:00 UTC)
- Invokes edge function `triage-digest-builder` via `net.http_post` with the
  service-role bearer token

## What it sends
1. **Discord** — one post to `DISCORD_PLATFORM_UPDATES_WEBHOOK` summarizing
   pending/proposed/resolved counts, audit pressure, 24h volume, AI budget
   used, and top 5 open errors. Skipped on quiet days.
2. **Email** — one transactional email per admin using the `triage-digest`
   React Email template (dark space-themed). Idempotency key
   `triage-digest:{user_id}:{YYYY-MM-DD}` so re-runs don't double-send.

## Cost discipline
- **No AI calls.** Pure SQL aggregation only.
- Quiet-day guard: if `pendingCount=0`, `proposedCount=0`, `resolvedYesterday=0`,
  and `auditPressure='none'`, the function returns `quietDay:true` and skips
  both Discord and email.
- One cron tick per day, no realtime, no polling.
- Service-role auth required (rejects with 401 otherwise).

## Files
- `supabase/functions/triage-digest-builder/index.ts`
- `supabase/functions/_shared/transactional-email-templates/triage-digest.tsx`
- Registered in `_shared/transactional-email-templates/registry.ts`
- Cron scheduled in migration `20260505_*` (job `triage-digest-daily`)

## BDD
DIGEST-001..004 in `bdd_scenarios` (feature_area_number 1115).
