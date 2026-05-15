## Root cause

The two "pending" rows you saw in the digest are not real errors — they're a feedback loop:

1. Yesterday, the auto-resolver / admin called `set_fix_queue_status(id, 'resolved', '<reason>')` on the original `email_signup_confirmation_pipeline_unhealthy` (×3) and `client_error` (×1) rows.
2. `set_fix_queue_status` writes an audit row with `event_type='fix_queue_status_changed'` and `error_message=<the resolution note>`.
3. The cron `discover_audit_fingerprints` scans `audit_log` for rows with `error_message IS NOT NULL`, fingerprints them, and inserts them into `agent_fix_queue` as new pending items — **except** for an `v_excluded_events` allowlist that does NOT contain `fix_queue_status_changed`.
4. Result: every resolution re-creates a phantom pending entry whose message reads like "Resolved: …", and the next digest reports those as new open errors. The original underlying issues are genuinely fixed (0 failed sends in last 24h, confirmed).

This violates the memory `mem://features/triage-noise-suppression` (6-layer defense — admin-action audit events should not enter the queue).

## Fix (3 changes)

1. **Migration — exclude meta-events from the discover loop.** Update `public.discover_audit_fingerprints` so `v_excluded_events` adds: `fix_queue_status_changed`, `fix_queue_triaged`, `fix_queue_proposed`, `fix_queue_dismissed`. (The other three are defensive — same admin-action class.) No behavior change for real errors.

2. **Migration — clean up the two phantom rows.** `UPDATE agent_fix_queue SET status='dismissed', dismissed_at=now(), dismissed_reason='meta: fix_queue_status_changed feedback loop (auto-cleanup)' WHERE event_type='fix_queue_status_changed' AND status='pending';` Idempotent, scoped to the 2 rows.

3. **Memory update.** Append to `mem://features/triage-noise-suppression`: "Layer 7: `discover_audit_fingerprints` v_excluded_events now includes `fix_queue_status_changed` and sibling admin-action events to prevent the resolve→audit→requeue feedback loop."

## Out of scope

- No changes to `set_fix_queue_status`, the digest builder, edge functions, or the auth-email pipeline (already healthy).
- No new tables, RLS, or UI work.
- No BDD additions — this is a SQL hygiene fix to existing infrastructure; the existing `triage-noise-suppression` BDD scenarios already assert "admin-action audit events do not enter agent_fix_queue."

## Risk

Very low. Migration is additive (array extension) + a 2-row dismissal. Pre/post diff: the daily digest will go quiet (0 pending) on next run.
