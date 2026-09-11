# ADR-0019: Set-based announcement enqueue (fix silent partial reach)

- **Status:** Accepted (2026-09-11)
- **Related:** [ADR-0016](0016-email-tiering-and-notify-announcements-retirement.md) (tiers /
  `notify_opportunities` gate), [ADR-0017](0017-email-octopus-marketing-source-of-truth.md)
  (marketing stays in EO). Fixes the incident where an announcement reached ~198 of 1,579
  eligible members.

## Context

`send-announcement-email` selected the eligible audience and then **looped over recipients**,
doing ~5 sequential DB round-trips per recipient (suppression/unsub-token insert, `isV2Enabled`
lookup, `enqueue_email_v2`, `email_send_log` insert) inside a **single edge-function
invocation**. For 1,579 members that is ~8,000 serial round-trips; the runtime killed the
invocation partway, so only the first ~200 recipients were ever enqueued — the rest existed
nowhere to be retried.

The signature confirmed the mechanism: the ceiling **moved** between sends (250 one time, 198
the next). A fixed row cap (PostgREST `max-rows`) truncates at the _same_ number every time; a
_variable_ ceiling is a wall-clock/CPU **timeout**. The `notify_opportunities` gate (ADR-0016)
was already correct — the audience query returns all 1,579 — but the enqueue could not process
them in one invocation. Announcements ride the v2 `email_outbox` → `email-dispatcher` pipeline
(both send paths funnel through `enqueue_email_v2`).

## Decision

Enqueue the entire audience in **one atomic, set-based statement** instead of a per-recipient
edge loop.

1. **`enqueue_announcement_emails(p_announcement_id, p_subject, p_html, p_text, p_recipients)`**
   — a `SECURITY DEFINER`, service-role-only RPC that does a single `INSERT .. SELECT` over the
   eligible audience into `email_outbox`, mirroring `enqueue_email_v2`'s row shape.
   `ON CONFLICT (idempotency_key) DO NOTHING` on the deterministic key
   `announcement-<id>-<email>` makes re-runs a no-op. Returns `(eligible_count, enqueued_count)`.
2. **The edge function renders once and calls the RPC once.** O(1) round-trips regardless of
   member count, so it cannot time out, and there is no PostgREST page in the path to truncate.
   The rendered body is identical for every recipient (the unsubscribe token rides the outbox
   payload, not the HTML), which is what makes the set-based fan-out sound. Rendering is
   extracted to `_shared/email/announcement-render.ts` so both the function and any future
   caller share one renderer.
3. **Broadcast claim window = 24h.** Announcement rows set `expires_at = now() + 24h` rather
   than `email_policy_config.pending_expiry_minutes` (60 min, tuned for transactional pending).
   A 1,579-row burst takes hours to drain the bulk lane; a 60-minute window would expire the
   tail before the dispatcher reached it — re-introducing under-reach by a different door.
4. **Delivery-probe path.** A non-null `p_recipients` (surfaced as admin-only `test_recipients`
   on the function) enqueues _only_ those addresses and skips the Discord cross-post, so a real
   send can be verified end-to-end to a test inbox before the 1:N broadcast.
5. **Reach is surfaced, not silent.** The function returns and logs `eligible` and `enqueued`;
   the true audience size (≈1,579, not 198) is now visible on every send.

## Alternatives considered

1. **Batch the per-recipient DB writes in the edge loop.** Rejected: still O(N) work and still
   materializes the audience through a `max-rows`-capped REST read; a larger member base just
   moves the timeout, it does not remove it.
2. **Chunked continuation / self-re-invocation with a cursor.** Rejected: more moving parts,
   still O(N) invocations, and a partial run is still possible — the opposite of "structurally
   cannot under-reach."
3. **Raise the edge runtime limit.** Rejected: not reliably controllable, and it treats the
   symptom (loop too slow) rather than the cause (a loop where none is needed).
4. **Paginate the recipient read but keep the loop.** Rejected: fixes `max-rows` truncation but
   not the per-recipient-round-trip timeout, which is the actual failure here.

## Consequences

- An announcement send can no longer time out or silently truncate: the `INSERT .. SELECT` is
  all-or-nothing.
- **Recovery is a re-run.** Re-invoking the fixed send reaches the ~1,381 who were missed; the
  already-enqueued ~198 are no-ops (deterministic key), so nobody is double-emailed.
- Delivery throughput is still bounded by the v2 dispatcher's bulk-lane pacing. The 24h window
  gives the burst time to drain; the dispatcher's rate/circuit-breaker must be confirmed healthy
  before the full 1,579 send (verification step, not code).
- `email_send_log` "pending" rows flip to "sent" via the existing outbox→log write-back trigger,
  so the dashboard reflects real delivery; `email_outbox.status` remains the canonical truth.
- The `announcement-<id>-<email>` key format is now expressed in SQL (the RPC) as well as
  `message-id.ts`. The SQL is the runtime source of truth; the TS mirror is retained for
  documentation and its H8 unit test. A pgtap test pins the SQL output shape.
- Follow-ups (out of scope here): the `// @edge-cron` marker on this admin-invoked function looks
  spurious and should be reviewed; a delivery-reconciliation alert ("sent == eligible within N
  hours, else page") would make under-_delivery_ as loud as this change makes under-_enqueue_.
