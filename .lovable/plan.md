## Why it says "degraded"

`get_email_pipeline_health` flips status to **degraded** as soon as ANY failure exists in the last 24h:

```sql
WHEN (SELECT failed FROM delivery_totals) > 0 THEN 'degraded'
```

Current 24h window contains:
- 149 sent (project blast just drained successfully)
- 3 DLQ rows — all from yesterday's already-resolved signup TTL incident (`asamoahsandra9@gmail.com`, 13:58 UTC, "TTL exceeded (15 minutes)"). The TTL was already increased from 15→60 min in prior triage; these rows are historical and just aging out of the 24h window.
- 0 pending (blast finished sending)

So the banner is a **stale alert** triggered by 3 known-resolved rows, not a real outage. This is alert fatigue and violates "help users recognize and recover from errors" (the user can't dismiss it).

## Fix — tighten the health rule and add acknowledgment

Replace the binary "any-failure = degraded" logic with a graded, dismissible rule. Migration on `get_email_pipeline_health`:

1. **Severity tiers** (in priority order):
   - `overloaded` — provider rate-limit active (unchanged: `retry_after_until > now()`).
   - `degraded` — EITHER queue backlog (`queued > 100` OR `max_attempts >= 4`) OR fresh failures in the **last 60 minutes** that are not yet acknowledged in `agent_fix_queue`.
   - `healthy` — otherwise. Older failures (>1h) are surfaced as an info-level count, not a status flip.

2. **Acknowledgment join** — failures whose fingerprint exists in `agent_fix_queue` with `status IN ('resolved','wont_fix')` are excluded from the degraded check. Already-triaged incidents stop driving the banner automatically.

3. **Reason copy** updated to brand voice (welcoming, plain language, recovery action):
   - Degraded (fresh failures): "We're looking into a few recent email failures. Open the Email tab to review."
   - Degraded (backlog): "The email queue is catching up. New emails may take a few extra minutes."
   - Overloaded: unchanged.
   - Healthy with old (acknowledged) failures: status stays `healthy`, reason adds "All recent failures have been reviewed."

4. **UI** — no component changes needed; the existing badge + reason text driven by `data.health` will reflect the new rule. The 3 stale DLQ rows from yesterday will immediately stop triggering "degraded".

## Verification

1. Run the migration; re-load `/system-health`.
2. Banner should read **healthy** (the 3 DLQ rows are >24h-old fingerprints already marked `resolved` in `agent_fix_queue`, and there are no failures in the last 60 min).
3. Email tab still shows the historical DLQ rows for auditability.
4. Confirm the rule fires correctly by spot-checking: insert a synthetic failed row → status flips to `degraded`; mark its fingerprint resolved → status returns to `healthy` on next read.

## Files

- `supabase/migrations/<ts>_pipeline_health_graded.sql` — `CREATE OR REPLACE FUNCTION public.get_email_pipeline_health(...)` with the new severity rule and `agent_fix_queue` acknowledgment join.

No frontend, edge function, or schema changes.
