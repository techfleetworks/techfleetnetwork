---
name: Triage Critical Push
description: 5-minute cron pushes web notifications for new severity=error fingerprints; UNIQUE(fingerprint) dedup + 3/hr platform cap
type: feature
---
- Edge fn `notify-critical-fix` runs every 5 min via `notify-critical-fix-5m` cron.
- Source: `agent_fix_queue` rows where severity='error', status in (pending|triaged|proposed), not snoozed.
- Dedup table `triage_critical_push_log` (UNIQUE on fingerprint) — each fingerprint pushes admins once forever.
- Hard cap: 3 critical pushes per rolling hour (counts rows in log within last 60 min).
- Fans out to all admin `push_subscriptions` via existing `send-push-notification` with `notification_type='triage_critical'`, deep links to `/admin/system-health?tab=triage`.
- Service-role gated. Daily digest (Lane 4 batch) remains the catch-all; this is for criticals only.
- BDD: TRIAGE-005 covers "<5min critical push", TRIAGE-016 covers "same fingerprint never pushes twice", TRIAGE-017 covers "hourly cap halts further pushes".
