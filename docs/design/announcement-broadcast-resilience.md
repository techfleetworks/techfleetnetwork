# Announcement Broadcast: Resilience Design + Requirements Audit

Status: draft for approval · Date: 2026-11-12 · Author: in session with repo owner (mdenner)
Scope: the announcement email broadcast path (composer → `send-announcement-email` →
`enqueue_announcement_emails` → `email_outbox` → `email-dispatcher` → Resend).

---

## 0. Skeptical audit of the requirement

The ask was: *"make this structurally impossible to fail, break, error, skip, bug, or get
hacked."*

**"Impossible to fail" is not an achievable or testable requirement, and I will not claim it.**
It is an unfalsifiable absolute. Resend can have an outage, Postgres can be down, a region can
go dark. A requirement that "matches everything" cannot be designed to or verified. Treating it
literally is how teams ship false confidence.

What **is** achievable, and what this document commits to, is converting that absolute into a
set of **concrete structural invariants** — each one closes a specific failure mode *by
construction* (not by vigilance), and each one is **testable** so CI can prove it holds. The
honest reframing:

- Delivery cannot be made impossible to fail.
- Delivery **can** be made impossible to fail **silently**, impossible to **under-reach without
  self-healing**, impossible to fail from **any cause we have actually hit**, and impossible to
  **starve the auth/login lane**. The residual (a provider or database outage) is **bounded,
  retried, and alerted** — never silent, never permanent-by-neglect.

Every requirement below is written as a negative invariant with a test, per repo convention
(`arch-encode`): a vague "be resilient" is worthless; "no request-path statement enqueues more
than N rows, proven by a fitness test" is enforceable.

### 0.1 Audit of the *prior* fix (the ticket + ADR I wrote earlier today)

The interim fix — `ALTER FUNCTION enqueue_announcement_emails SET statement_timeout = '120s'` —
**does not satisfy this requirement, and I was wrong to let it stand in as "the fix."** Findings:

1. **It defers the same failure, it does not remove it.** It still does unbounded work in one
   statement. At the current ~2,279 recipients it fits in 120s; at 10k or 100k (a stated goal in
   the email rearchitecture spec) it will blow 120s too. The failure mode is *scaling-latent*,
   not fixed.
2. **It leaves the failure silent.** The root reason you did not know the send died is the UI
   fire-and-forget `.catch` at warn and the absence of any reconciliation. The timeout bump does
   nothing about that. A send that fails for a *different* reason tomorrow is still invisible.
3. **It ignores four other live failure modes** documented in prior incidents: dispatcher stall
   → silent 24h expiry; the bulk circuit breaker that opens and never auto-closes; rows orphaned
   in `sending` on a mid-batch 429; and the bulk lane sharing Resend quota with auth (a blast can
   lock members out of login).
4. **`120s` is a magic number** with no derivation.

Verdict: the timeout attribute is a legitimate **immediate unblock** (ship it today so mail
flows), but it is **defense-in-depth**, not the structural fix. Keep it; do not call it done.

---

## 1. Failure-mode matrix (every way this path can fail / break / skip / get hacked)

| # | Failure mode | Evidence | Structural remedy (invariant) |
|---|---|---|---|
| F1 | Unbounded enqueue in one statement → `statement_timeout` cancel → full rollback → zero sent | observed 2026-11-12 | Fan-out is **chunked + resumable**; no single statement enqueues > BATCH rows. Audience size is never a correctness factor. |
| F2 | Send fails **silently** (UI fire-and-forget; warn-only) | observed (audit_log) | Every broadcast is a **durable job with status**; a **reconciliation** asserts `enqueued == eligible` and `terminal == enqueued` within SLA and **pages** on any shortfall. |
| F3 | Dispatcher stalls → `pending` rows expire at 24h → silent under-reach | prior incident (memory) | Expiry re-drives, never silently drops; **alert** on pending-age and dispatcher liveness. |
| F4 | Bulk circuit breaker opens and **never auto-closes** | prior incident (memory) | Breaker has a real **half-open auto-probe**, and **pages** if open past threshold. |
| F5 | Rows orphaned in `sending` on mid-batch 429 → swept to `expired` → lost | prior incident (memory) | A sweep **reclaims** stuck `sending` → `pending` (idempotent); never to `expired`. |
| F6 | Bulk send exhausts Resend daily quota **shared with auth** → login/password-reset locked out | prior incident (memory) | **Physical lane isolation**: bulk uses its own Resend key/subdomain/quota with a reserved auth headroom. A bulk 429 cannot throttle auth. |
| F7 | Retry / re-run **double-sends** | handled today | Deterministic `idempotency_key`, `ON CONFLICT`; re-run re-drives only `expired`. Keep + test. |
| F8 | Audience **collapses** (opt-in gate changed/broken) → sends to nobody | plausible | Reconciliation flags `eligible` far below the trailing baseline and **pages** before it is accepted as normal. |
| F9 | Hand-applied prod RPC **drifts** from source → PostgREST `PGRST202`/signature mismatch | prior incident (memory) | Migrations applied through the schema-drift gate; a **post-deploy smoke** calls the RPC over PostgREST and fails the deploy if it 4xx/5xx. |
| F10 | A **new sender** bypasses the governed pipeline (raw enqueue, inline send) | drift risk | Fitness test + existing `no-legacy-email-send` lint: **no code path sends outside the outbox**. |
| H1 | Non-admin triggers a broadcast | — | Server-verified admin; `SECURITY DEFINER` RPCs `service_role`-only, no anon (pgTAP). |
| H2 | Header injection via subject (CRLF) | — | Strip CR/LF from subject; sanitize body. @security BDD. |
| H3 | Suppressed / unsubscribed address re-mailed | — | Suppression anti-join enforced **at enqueue** (dispatch never re-checks). Test. |
| H4 | Client supplies its own recipient list for a real send | — | Full-send recipients derived **server-side** from the gate; client list only on the admin test path. Test. |
| H5 | Secrets or PII (emails) leak into logs | — | Vault secrets; logs carry user-id/hash, never raw email. Test. |

---

## 2. Structural invariants (the real requirements, each testable)

- **I1 — Bounded work.** No statement on the request path or in a trigger enqueues more than
  `BATCH` rows (default 500). *Test:* fitness test asserts the enqueue is chunked; a load test at
  100k synthetic recipients completes with no single statement over the batch size.
- **I2 — No silent outcome.** Every broadcast ends in a terminal status, and a reconciliation
  job pages if `enqueued <> eligible` or if delivery does not reach `enqueued` within SLA.
  *Test:* inject a stalled broadcast → the alert fires; BDD `@critical`.
- **I3 — Self-healing in-flight.** An interrupted enqueue resumes from a cursor; an interrupted
  dispatch reclaims `sending` → `pending`. *Test:* kill mid-run → next tick completes; no row
  lost to `expired` from an interruption.
- **I4 — Lane isolation.** A bulk send cannot consume the auth lane's send budget. *Test:*
  saturate bulk to 429 → an auth send in the same window still succeeds.
- **I5 — Idempotent.** Re-running any send delivers to no one twice. *Test:* double-run → zero
  net new deliveries on the second.
- **I6 — Least privilege + input-safe.** Admin-only, consent-derived server-side, CRLF-stripped,
  suppression-enforced, secrets in Vault, no PII in logs. *Test:* @security BDD + pgTAP.
- **I7 — No bypass.** Every send goes through the governed outbox. *Test:* lint + fitness.
- **I8 — Deploy-verified.** The RPC is proven callable over PostgREST after every deploy.
  *Test:* post-deploy smoke gates the deploy.

"Structurally impossible to fail" = **I1–I8 all hold and are all gated in CI.** That is the
testable meaning of the ask.

---

## 3. Target architecture

Reframe a broadcast from "one synchronous fan-out" to "a durable job drained by bounded,
self-healing workers."

1. **Intent (O(1) request work).** Posting a send writes ONE `announcement_broadcast` row:
   `{announcement_id, requested_by, status='queued', requested_at}`. The web request does nothing
   else — it cannot time out. (Removes F1 at the source.)
2. **Chunked enqueue worker (cron).** Claims `queued` broadcasts; computes the eligible audience
   once (stored as `eligible_count`); enqueues into `email_outbox` in `BATCH`-sized statements,
   advancing a cursor, idempotent via `ON CONFLICT`. Loops across ticks until `enqueued ==
   eligible`, then marks `enqueued`. Carries its own generous `statement_timeout` as
   defense-in-depth. (I1, I3.)
3. **Dispatcher hardening.** Reclaim orphaned `sending`; breaker half-open auto-probe + page on
   stuck-open; keep batch/gap pacing. (F3, F4, F5.)
4. **Lane isolation.** Bulk gets its own Resend credential/subdomain and a quota reserve for
   auth. (F6, I4.)
5. **Reconciliation + alerting (the anti-silent spine).** Periodic: per broadcast assert
   `enqueued == eligible` and terminal convergence within SLA; page on shortfall, stuck state, or
   suspicious audience collapse. Reuses the two-channel alert from ADR 20261110 (so the alert
   itself cannot go dark). (F2, F8, I2.)
6. **Admin visibility.** The composer shows live broadcast status (queued → enqueuing N/▒ →
   delivering → complete / **attention**), so "posted" never masks "email died."
7. **Security + gates** per I6/I7/I8.

---

## 4. Phased delivery (expand / contract, each PR independently shippable + gated)

- **PR1 — Stop the bleeding + end silence (ship first).** (a) `statement_timeout` attribute on
  the current RPC (immediate unblock); (b) reconciliation alert: `enqueued <> eligible` pages.
  This alone makes the *current* failure both survivable and loud. ADRs + BDD `@critical`.
- **PR2 — Chunked, resumable enqueue job.** Intent row + cron worker + cursor. Removes F1
  structurally. Fitness test for bounded work; 100k load test.
- **PR3 — Dispatcher hardening.** Orphan reclaim, breaker half-open + stuck-open page. (F3–F5.)
- **PR4 — Lane isolation.** Separate bulk Resend credential + auth reserve. (F6.)
- **PR5 — Observability + admin status + full gates.** SLIs/SLOs, runbook, composer status UI,
  @security BDD, pgTAP, fitness functions wired blocking into CI.

Each PR: ADR written with the code, BDD scenarios in the shared index, passes
`npm run check:architecture` + `judge-arch`, mutation-tested where it adds a gate. Migrations are
hand-applied to prod (no prod ledger) with the live-definition verification from F9.

---

## 5. Honest limits (named, not buried)

- This does **not** make delivery survive a Resend outage or a Postgres outage. It makes those
  **bounded, retried, and alerted** — the send resumes when the dependency returns, and a human
  is paged meanwhile. It is not magic.
- The anti-silent guarantee (I2) depends on the alert channel. ADR 20261110 already hardened
  that to two independent channels; this work reuses it and must not regress it.
- Lane isolation (F6) requires a second Resend credential/plan; that is an operational/billing
  action the owner must take. Flagged, not assumed.
- "Impossible to get hacked" is likewise reframed to I6 (least privilege, input-safe, secret
  hygiene, no bypass) with @security tests. No one can honestly promise unhackable.
