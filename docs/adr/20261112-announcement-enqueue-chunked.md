# ADR 20261112b — Announcement enqueue is bounded and resumable (chunked)

- Status: accepted
- Date: 2026-11-12
- Deciders: repo owner (mdenner), in session
- Scope: PR2 of `docs/design/announcement-broadcast-resilience.md`
- Relates to: ADR 20261112 (PR1 — statement_timeout + reach alert), ADR-0040 (the
  set-based enqueue), ADR-0026 (expand/contract).

## Context

PR1 widened `enqueue_announcement_emails`' `statement_timeout` to 120s so the
single-shot set-based INSERT of the whole audience is no longer cancelled. That
fixes today's failure but is **scaling-latent**: it is still one unbounded statement,
and at a large enough audience 120s is also finite. The design doc's invariant **I1**
is "no statement enqueues more than BATCH rows," which the single-shot INSERT cannot
satisfy by construction.

The design doc sketched PR2 as an intent row drained by a cron worker. That is a
larger change to the live send path (a new table, a worker, a cron, and an async UX
where "posted" no longer means "enqueued"), and it mostly buys **auto-drain /
self-healing**, which the doc already assigns to PR5 (the reconciliation backstop).

## Decision

Implement I1 with the **smallest change that removes the failure**: chunk the
enqueue into bounded batches, keeping the send synchronous.

- `announcement_eligible_emails()` — a new `STABLE SECURITY DEFINER` function that is
  the **single owner** of the full-send audience predicate (opted-in, usable email,
  not suppressed, normalized). Previously this predicate lived inline in
  `enqueue_announcement_emails`; `enqueue_announcement_emails` is refactored to select
  from it (same signature, same return, same behaviour), so the audience has one
  definition instead of being copied into the batch function.
- `enqueue_announcement_batch(p_announcement_id, p_subject, p_html, p_text,
  p_after_email, p_batch_size)` — inserts the next `<= p_batch_size` eligible
  recipients whose normalized email is `> p_after_email`, ordered by email, with the
  same payload / idempotency / `ON CONFLICT` as the set-based RPC. Returns
  `(last_email, considered, inserted, effective_batch)`. Every statement touches at
  most `p_batch_size` rows, so it **cannot** be cancelled by the statement timeout.
  `effective_batch` is the clamped size the call actually used; the driver detects
  end-of-audience on `considered < effective_batch`, never on the size it requested,
  so a clamp can never make a full slice look short and stop the loop early (a silent
  under-enqueue — the exact failure class this PR removes; caught in fresh-context
  review).
- `enqueueAnnouncementInBatches` (edge `_shared`) drives the loop: advance the cursor
  by `last_email` until a slice shorter than `p_batch_size` signals the end, bounded
  by `MAX_BATCHES` so it can never spin forever. The edge function uses it for real
  broadcasts; the delivery-test path (an explicit `<= 50` list) stays a single call.

Resumability: each batch commits independently. A crash mid-loop leaves the committed
batches in place; a re-run is idempotent (unique `idempotency_key`, `ON CONFLICT`
re-drives only a prior `expired` row) and completes the remainder. On any batch error
the edge function pages through the PR1 reach alert before returning 500 — never
silent.

## Consequences

- Audience size is no longer a correctness factor for the enqueue; I1 holds and is
  provable (pgTAP: a batch never returns more than `p_batch_size`; two batches cover
  the audience exactly once; `announcement_eligible_emails` and the batch agree).
- The 120s attribute from PR1 is retained as defense-in-depth but is now
  unreachable in normal operation (each batch is small and fast).
- Synchronous UX is unchanged: the edge function still completes the whole send and
  the Discord cross-post within its invocation, so "posted" still means "enqueued."

## Scope boundary / what PR2 does NOT do

- **Auto-drain / self-healing** (a worker that resumes a half-finished broadcast with
  no human action) is **PR5**, together with the periodic reach reconciliation. PR2's
  resumability is "a re-run completes it," not "it completes itself." This is a
  deliberate deviation from the design doc's worker sketch, taken to minimize blast
  radius on the live send path; the batch RPC and audience owner built here are
  exactly what a PR5 worker would call, so nothing is thrown away.

## Alternatives considered

- **Intent row + cron worker now (the doc's sketch).** Rejected for PR2: larger blast
  radius (new table, cron, async UX, Discord-timing change) for a benefit (auto-drain)
  that belongs to PR5. Deferred, not dropped.
- **Leave PR1's 120s single-shot as the fix.** Rejected: scaling-latent, violates I1.
- **Raise the batch into one statement with a bigger timeout.** Rejected: that is the
  single-shot design again; a bounded statement is the invariant.
