# ADR 20261113c — Don't audit per-recipient bulk enqueue markers (the root fix)

- Status: accepted
- Date: 2026-11-13
- Deciders: repo owner (mdenner), in session
- Scope: PR6 of `docs/design/announcement-broadcast-resilience.md` — the root fix
- Relates to: the audit hash chain (`20260423204012`), `audit_email_send_log`
  (`20260605201145`), the set-based enqueue (`20260912120000`), PR1/PR2.

## Context — the measured root cause

A full announcement enqueue was **measured at ~3.6s for ~2,283 recipients** (≈1.6ms/row).
That is not the inserts — a 2,283-row insert is milliseconds. The cost is a chain of work
nobody intended for a bulk send:

> enqueue writes one `email_send_log` **'pending' marker per recipient** → `trg_audit_email_send_log`
> fires on each INSERT → ~2,283 inserts into `audit_log`, a **tamper-evident append-only hash
> chain** (built 2026-04-23) whose per-row triggers also encrypt + redact → the chain is
> **serialized** (each row hashes the previous), so the appends run one-behind-another and
> contend with every other audit write in the app.

At ~3.6s the enqueue sat under 2.5× below the 8s connection wall (`statement_timeout` /
`lock_timeout`, both 8s on `authenticator`). Growing audit volume tipped it past 8s; the
statement was cancelled and the **whole enqueue rolled back silently** (the 2026-11-12
incident). PR1 (raise the timeout) and PR2 (chunk) only *accommodate* this cost — PR1 may
not even address it if the wall was `lock_timeout`. This PR removes the cost.

## Decision

`audit_email_send_log()` skips the per-recipient **announcement 'pending'** marker inserts
— the one line `IF NEW.template_name='announcement' AND NEW.status='pending' THEN RETURN NEW`.
Nothing else changes: every other lane and status is audited exactly as before, and the
function's UPDATE branch still audits announcement delivery **failures**
(failed/dlq/bounced/complained).

This is safe for compliance, not a gap:
- **The skipped markers never captured the admin anyway.** They are inserted under the
  `SECURITY DEFINER` service-role enqueue, so their audit actor (`auth.uid()`) was already
  `NULL`. Dropping their audit loses no authorization evidence.
- **The authorizing admin is recorded** server-side in `announcements.marketing_attested_by`
  / `marketing_attested_at` (columns on the announcement, set on send). Note these are
  mutable table columns, **not** a hash-chained `audit_log` event — the `announcements`
  audit trigger fires on INSERT/DELETE only, so the attestation UPDATE emits no audit event.
- **Delivery failures** remain audited (the UPDATE branch, untouched), and an enqueue
  failure pages via the `email_announcement_reach_failed` audit event (PR1).
- Only the per-recipient `email_queued` *noise* (thousands of identical rows per send) is
  dropped. The hash chain's integrity is unaffected — `verify_audit_chain()` validates the
  rows that are written; writing fewer does not break it. Consistent with `decisions.md`
  ADR-0021 (high-volume signals → an aggregate, never a per-occurrence audit row).
- **Honest gap (pre-existing, not introduced here):** there is no hash-chained record of a
  *successful* broadcast's actor — the markers did not provide one. If tamper-evident
  per-send authorization is required, that is a separate follow-up.

## Why this is the structural fix (and PR1/PR2 were not)

With the markers unaudited, the enqueue **no longer appends to the serialized hash chain at
all** — so it cannot be slowed by audit-chain contention, by any amount, ever. That removes
the failure by construction rather than raising a limit it still races. Expected result: the
~3.6s enqueue drops to **sub-second** (re-measure after applying — the before/after is the
proof).

Combined, the failure class is closed from every side:
- **This PR:** the enqueue does O(N) fast inserts, no per-row audit → structurally clear of
  the 8s wall by a huge margin.
- **PR2:** bounded batches → no single statement is unbounded even if something else slows
  (defense in depth).
- **PR1's reach alert:** if an enqueue ever *did* fail, it pages — no silent failure.
- **This PR's pgTAP** is the regression guard: it fails if the markers are ever audited again.

Honest bound: "structurally impossible" is scoped to *this* failure class (the enqueue slowed
into the timeout wall). No software is immune to a provider/DB outage; those are bounded,
retried, and alerted, not silent.

## Alternatives considered

- **Drop the `email_send_log` markers entirely.** Rejected: admin dashboards read them by
  `announcement_id`, and the write-back's INSERT-vs-UPDATE semantics weren't confirmed — so
  removing them risked blanking the dashboards. Skipping only their *audit* keeps the markers
  and the dashboards while removing the cost.
- **Keep PR1's timeout bump as the fix.** Rejected: it accommodates the cost, may not address
  a `lock_timeout`, and leaves the enqueue riding the serialized chain.
- **Make the audit set-based (one summary row per send).** A reasonable *future* option —
  it would also fill the honest gap above (a hash-chained record of who authorized a send).
  Deferred, not bundled here: it is not needed to fix the timeout, and it is additive on top
  of this change.
