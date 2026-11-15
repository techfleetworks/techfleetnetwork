# ADR 20261113 — Reclaim stuck 'sending' email rows

- Status: accepted
- Date: 2026-11-13
- Deciders: repo owner (mdenner), in session
- Scope: PR3 of `docs/design/announcement-broadcast-resilience.md`
- Relates to: the v2 outbox/breaker (`20260609195852`), the stale-expiry sweep
  (`20260610232948`, `expire_stale_pending_v2`), ADR-0026 (expand/contract).

## Context

The dispatcher claims a whole batch to `status='sending'` in one statement, then
sends one row at a time. On a Resend 429 it breaks the loop: the 429'd row is recorded
back to `pending`, but the **rest of the already-claimed batch stays in `sending`** and
nothing returns it to `pending`. A crashed or timed-out dispatch invocation orphans its
in-flight batch the same way.

Those orphans then hit `expire_stale_pending_v2` (cron every 5 min), which expires
`status IN ('pending','sending')` past `expires_at` (bulk default 60 min) → the rows go
to `expired` and are never sent. That is a **silent under-reach** — the exact failure
class invariant I3/F5 ("self-heal in-flight") exists to prevent. There is no
`sending → pending` reclaim anywhere in the system today.

## Decision

Add `reclaim_stale_sending_v2()`: a **bulk** row that has been `sending` longer than a
10-minute lease but is **not** yet expired is an orphan — return it to `pending`
(`next_attempt_at = now()`, `claimed_at = NULL`) so the dispatcher retries it. Schedule
it on cron every 2 minutes — **ahead of** the 5-minute expiry sweep — so orphans are
reclaimed and retried rather than silently expired.

- **Lease = 10 minutes, chosen to exceed the edge runtime's hard wall-clock cap.** A
  dispatch invocation cannot outlive that cap, so a row still `sending` past 10 minutes
  is provably from a **dead** invocation, not a slow live one — which is what makes the
  reclaim safe from a double-send race. This is **at-least-once by design**: in the
  narrow window between "provider accepted" and `record_email_attempt_result('sent')`,
  a crash then a reclaim re-dispatches the same row (same `message_id`/payload — a
  duplicate of the same message, not a divergent one). Duplicate-delivery beats
  silent-loss, which is the whole point. (A provider-side idempotency key on
  `message_id`, added in PR3b's dispatcher change, removes even the duplicate.)
- **Bulk lane only.** The same orphaning exists on auth/transactional, but reclaiming
  there means at-least-once redelivery of OTP / magic-link / password-reset mail in the
  highest-blast-radius, actively-refactored area. That is deferred to **PR3b**, which
  adds auth/tx reclaim **with** a dedicated auth-lane pgTAP and the provider idempotency
  key — so this PR's runtime scope matches its ADR and its tests exactly.
- An already-expired `sending` row is intentionally left to the expiry job — reclaiming
  a row past its TTL would fight that owner; TTL is a separate, deliberate terminal state.

Expand-only / additive: a new `SECURITY DEFINER` function (service_role-only) + a new
cron job. No existing function, table, trigger, or cron is modified.

## Consequences

- A mid-batch 429 (or a crashed dispatch) no longer silently loses the rest of the
  batch; those rows are retried within ~5–7 min, well before the 60-min expiry.
- Proven by pgTAP (`email_reclaim_stale_sending_test.sql`): the orphan is reclaimed,
  an in-lease row and an already-expired row are not, grants are service_role-only, the
  cron is scheduled.

## Scope boundary — what PR3 does NOT do (split out on purpose)

The **circuit-breaker half-open auto-close** and the **stuck-open page** are *not* in
this PR. They require rewriting `claim_due_emails` and `record_email_attempt_result`,
which gate the **auth and transactional lanes too** (login / password-reset email), not
just bulk. That is the highest-blast-radius change in this program and deserves its own
focused, heavily-tested PR with pgTAP proving the auth lane is unaffected. It ships as
**PR3b**. This PR is the additive, zero-existing-code-touched half, so it can land and
help immediately without that risk.

## Alternatives considered

- **Fix only the dispatcher** (reset the remaining batch to `pending` on a 429 break).
  Good, but covers only the 429 cause and edits the hot dispatch path; the reclaim cron
  covers *every* orphan cause (429, crash, timeout) with zero change to the dispatcher.
  The dispatcher-side reset is a worthwhile latency optimization for PR3b/later, not a
  substitute for the safety net.
- **Shorten `expires_at` so orphans clear faster.** Rejected: that would expire
  legitimately pending mail sooner — the opposite of what we want.
- **Reclaim expired rows too.** Rejected: TTL expiry is a deliberate terminal state
  owned by `expire_stale_pending_v2`; reclaiming past-TTL rows would fight that owner.
