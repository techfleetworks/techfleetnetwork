# ADR-0040: Set-based announcement enqueue (fix silent partial reach)

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
   eligible audience into `email_outbox`, mirroring `enqueue_email_v2`'s row shape, on the
   deterministic key `announcement-<id>-<normalized-email>`. `ON CONFLICT` re-drives a
   prior-send `expired` row back to `pending` (so the recovery run reaches a tail the old
   60-min window expired) but leaves `sent`/`sending`/`suppressed`/`dlq` untouched — no
   double-send. Returns `(eligible_count, enqueued_count)`.
2. **Suppression + normalization parity with the path it replaces.** The audience anti-joins
   `suppressed_emails` (the v2 pipeline enforces suppression ONLY at enqueue — dispatch and the
   provider never re-check; the old `enqueueEmail()` path did the check, a raw INSERT skips it),
   and normalizes email as `lower(regexp_replace(email,'^\s+|\s+$','','g'))` to byte-match the
   old `email.trim().toLowerCase()` key so `ON CONFLICT` recognizes the ~198 already-enqueued
   rows instead of duplicating them.
3. **The edge function renders once and calls the RPC once.** O(1) round-trips regardless of
   member count, so it cannot time out, and there is no PostgREST page in the path to truncate.
   The rendered body is identical for every recipient, which is what makes the set-based
   fan-out sound. Rendering is extracted to `_shared/email/announcement-render.ts`.
4. **Broadcast claim window = 24h.** Announcement rows set `expires_at = now() + 24h` rather
   than `email_policy_config.pending_expiry_minutes` (60 min, tuned for transactional pending).
   A 1,579-row burst takes hours to drain the bulk lane; a 60-minute window would expire the
   tail before the dispatcher reached it — re-introducing under-reach by a different door.
5. **One dispatch ping per statement.** `notify_email_outbox_v2` (the AFTER-INSERT trigger)
   gains a transaction-local debounce (`set_config(..., is_local=true)`), so a bulk INSERT
   fires ONE dispatcher ping instead of one per row — otherwise a 1,579-row insert fanned out
   ~1,579 near-simultaneous dispatcher invocations and tripped the bulk-lane circuit breaker.
   The 30–60s cron remains the safety net.
6. **Delivery-probe path.** A non-null `p_recipients` (admin-only `test_recipients` on the
   function) enqueues _only_ those addresses and skips both the Discord cross-post and the
   attestation re-stamp, so a real send is verified end-to-end to a test inbox first.
7. **Reach is surfaced, not silent.** The function returns and logs `eligible` and `enqueued`.
   The Discord cross-post is gated on `enqueued > 0` (an idempotent re-run posts nothing), and
   an attestation-stamp write failure now blocks the send instead of being a swallowed await.

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
- The `announcement-<id>-<normalized-email>` key format now lives solely in the RPC (SQL). The
  orphaned `message-id.ts`/`message-id.test.ts` (dead after this change) were deleted, and a
  pgtap assertion pins the exact key including the `lower(regexp_replace(...))` normalization.
- The per-recipient `unsubscribe_token`, vestigial in the v2 send path (nothing under
  `_shared/email` reads it; the provider builds no List-Unsubscribe header from it), was dropped
  from the payload rather than persisted.
- This change was hardened by an adversarial multi-agent review before deploy, which caught and
  fixed a suppression-list bypass, a recovery-run key mismatch, a Discord re-post on re-run, and
  the dispatcher thundering-herd — all now covered by pgtap/unit tests.
- Follow-ups (out of scope here): the `// @edge-cron` marker on this admin-invoked function looks
  spurious and should be reviewed; a delivery-reconciliation alert ("sent == eligible within N
  hours, else page") would make under-_delivery_ as loud as this change makes under-_enqueue_;
  and making the pgtap suite gating in CI so a failed proof blocks merge.
