# ADR 20261113b — The email circuit breaker auto-recovers (half-open)

- Status: accepted
- Date: 2026-11-13
- Deciders: repo owner (mdenner), in session
- Scope: PR3b of `docs/design/announcement-broadcast-resilience.md`
- Relates to: the v2 breaker (`20260609195852`), the unwired pure state machine in
  `_shared/email/domain/policies.ts`, PR3 (`20261113` — reclaim), ADR-0024 (invariant
  proven at its owning layer).

## Context

The v2 circuit breaker (`email_lane_state`) was never able to recover on its own. On
repeated Resend 429s `record_email_attempt_result` flips a lane `closed → open`, but
**nothing in the live SQL ever writes `circuit_state = 'half_open'`**. Consequences:

- The success branch of `record_email_attempt_result` that closes a lane only fires
  `WHEN circuit_state = 'half_open'` — which is unreachable, so a lane never closes.
- Once `open`, `probe_at` is frozen at `opened_at + 30s`; the gate in `claim_due_emails`
  then lets rows through forever (a de-facto leaky half-open) but the state stays `open`.
- A new 429 cannot re-arm (the open UPDATE is guarded `AND circuit_state = 'closed'`).
- The only way back to `closed` is the admin-only `resume_email_lane()`.

So a transient provider blip permanently wedges the lane. A correct state machine exists
in `_shared/email/domain/policies.ts` (`permitLane`/`applyOutcome`) but is **not wired**
into the SQL dispatch path — it is only unit-tested.

These RPCs gate the **auth and transactional lanes too** (login, password-reset, OTP,
magic-link), not just bulk — so this is the highest-blast-radius change in the program.

## Decision

Add exactly the two missing transitions to the live SQL, copying everything else verbatim:

1. **`claim_due_emails`** — after claiming a probe batch, promote `open → half_open` for
   any lane whose `probe_at` has elapsed, and **reset `consecutive_success` to 0 on that
   entry**. This makes the existing success-closes-from-half_open logic reachable, and the
   reset is load-bearing: the success branch increments `consecutive_success` on every
   `sent` regardless of state, so in-flight rows completing after a lane opened can leave a
   stale high count that would otherwise close the lane on the *first* probe success
   instead of a fresh run.
2. **`record_email_attempt_result`** (rate_limited branch) — a 429 while `half_open`
   re-opens the lane with a fresh `probe_at` and resets `consecutive_success`, so a failed
   probe backs off again.

The resulting machine: `closed →(429 threshold)→ open →(probe window elapses, claim)→
half_open →(cb_close_success_threshold successes)→ closed`, or `half_open →(429)→ open`.
The `closed → open` logic, the eligibility gate, backoff, DLQ, suppression, and the
success/close logic are unchanged.

**Probe shape, stated honestly:** while `half_open`, `probe_at` is left elapsed, so each
dispatch tick claims a full `p_max` batch (not a single message) until a run of successes
closes the lane or a 429 re-opens it. Pacing exists at the **re-open boundary** (a failed
probe sets a fresh 30s `probe_at`), not within `half_open`. This is not a regression — a
stuck-`open` lane previously leaked full batches forever — and it is bounded (it closes
after the success threshold or re-opens on a 429).

**Auth safety.** The new transitions only touch lanes already in `open`/`half_open`. A
healthy (`closed`) lane — every lane in normal operation, including auth — is never
touched: it claims and sends exactly as before. `email_breaker_half_open_test.sql`
asserts this explicitly (Scenario B), alongside the full recovery machine.

**Operator visibility.** `email-pipeline-health` gains a probe that pages via the existing
`write_audit_log` sink (event `email_breaker_degraded`, de-noised per lane) when a lane is
**not `closed` AND its oldest pending row has been waiting > 60 min** — i.e. the backlog is
not draining. It keys off oldest-pending age, not `opened_at` (which refreshes on every
reopen while a down provider cycles open/half_open), and a genuinely recovering lane drains
oldest-first so its backlog age stays low and it does not false-page. All of the probe's
reads surface their errors so the observer cannot itself go silent.

## Consequences

- A rate-limited lane recovers automatically once the provider does, instead of staying
  wedged until an admin runs `resume_email_lane`.
- `resume_email_lane` remains as the manual override (e.g. to force an immediate close).
- Expand (behaviour-preserving-for-closed `CREATE OR REPLACE`, same signatures/grants),
  idempotent, hand-applied. pgTAP owns the proof (db-test job).

## Scope boundary

- **Not here:** widening PR3's stuck-`sending` reclaim to the auth/tx lanes, and the
  provider-side `message_id` idempotency key that makes that safe. Those remain a
  follow-up (they change the dispatcher send path), tracked with PR4/PR5.
- The `email_breaker_degraded` alert is the minimal "+page"; richer breaker SLOs/
  dashboards belong to PR5 (observability).

## Alternatives considered

- **Wire `policies.ts` into the dispatcher** (replace the SQL breaker with the pure TS
  machine). Rejected for now: a much larger reroute of the dispatch path; the two-line
  SQL transition reaches the same correct machine with far less blast radius.
- **Auto-close from `open` directly on success** (skip `half_open`). Rejected: loses the
  paced-probe safety that stops a recovering lane from immediately re-flooding a
  still-fragile provider.
