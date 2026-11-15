# ADR 20261112 — Announcement broadcasts: unblock the enqueue, and never fail silently

- Status: accepted
- Date: 2026-11-12
- Deciders: repo owner (mdenner), in session
- Scope: PR1 of `docs/design/announcement-broadcast-resilience.md`
- Relates to: ADR-0040 (set-based announcement enqueue), ADR 20261110 (the alert
  cannot go dark), the `spf_apply_dataset` / `spf_rebuild_edges` timeout precedent
  (20260816 / 20260817). Kanban: "Announcement Emails Silently Fail to Send".

## Context

Announcement emails go: composer → `send-announcement-email` edge function →
`enqueue_announcement_emails` RPC (one set-based `INSERT … SELECT` into
`email_outbox`) → `email-dispatcher` → Resend.

On 2026-11-12 the announcement "Please Help Us Plan Masterclasses"
(`500a97b5-7cc3-4daf-80da-1a1510fa4a54`) posted but **no email was sent** and **no
one was told**. Two distinct defects combined:

1. **The enqueue was cancelled.** Over PostgREST the RPC runs under the connection's
   8s `statement_timeout` (`authenticator` = 8s, `authenticated` = 8s; `service_role`
   sets none and so does not raise it; `postgres` has none, which is why the same RPC
   completes 2,279/2,279 in the SQL editor). The set-based insert of ~2,279 rows plus
   per-row triggers now exceeds 8s, so Postgres cancelled it (SQLSTATE `57014`) and
   rolled the whole transaction back — zero rows enqueued. (`observed`: `audit_log`
   shows the edge fn stamped attestation at 15:35:13 then returned a non-2xx ~8s
   later; `pg_roles` confirms the 8s wall and the function's missing override; the RPC
   succeeds as `postgres`.)
2. **The failure was silent.** `AnnouncementService.sendNotifications` invokes the
   edge function fire-and-forget and only logs the resulting non-2xx at warn. The
   admin saw "Announcement posted" and nothing else. (`observed`: the frontend
   `infra_transient` audit row at 15:35:21.)

This ADR fixes both. It is the immediate, defensive layer; the structural fix (a
chunked, resumable enqueue so audience size is never a correctness factor, plus
dispatcher hardening, lane isolation, and a full reconciliation) is PR2–PR5 of the
design doc.

## Decision

**1. Give the enqueue its own statement_timeout.**

```sql
ALTER FUNCTION public.enqueue_announcement_emails(uuid, text, text, text, text[])
  SET statement_timeout = '120s';
```

`120s` matches the `spf_apply_dataset` precedent for the identical "service_role
connection's short statement_timeout" failure. A function-attribute `SET` applies for
the function's execution and overrides the inherited connection value, so it holds
regardless of which role connects or future timeout tightening. Body, grants
(`service_role` only), and semantics are unchanged — this only widens the time the
function may run. Honest limit: this does not make the single-shot enqueue scale
forever (at a large enough audience 120s is also finite); it buys correct behaviour
at the current and near-term size while PR2 removes the single-shot dependency.

**2. Route a failed broadcast to the durable audit sink.**

A new single owner, `supabase/functions/_shared/email/announcement-reach.ts`
(`emitAnnouncementReachAlert`), writes a `write_audit_log` row with event_type
`email_announcement_reach_failed` — the same paging channel `email-pipeline-health`
uses (System Health → Top Errors). `send-announcement-email` calls it in the
`enqueueError` branch before returning 500. Because it is server-side, it fires even
though the UI invoked the function fire-and-forget and the admin has navigated away.
A delivery test (`test_recipients`) is a probe, not a broadcast, so it does not page.

Alerting is best-effort: a failure to write the alert is logged and swallowed so it
can never mask or replace the original error (error handling: report, never hide).

## Consequences

- The exact 2026-11-12 failure is now both prevented (no cancel) and loud (an
  operator is paged through an existing channel). Proven by `announcement-reach.test.ts`
  and `announcement-reach.feature` (`@critical`).
- New event_type `email_announcement_reach_failed` appears in System Health; it
  de-noises on the `reason`/`eligible`/`enqueued` tuple.

## Scope boundary (what PR1 does NOT cover — stated so coverage is not overclaimed)

- PR1 pages when the **enqueue itself** fails. It does **not** yet catch "the edge
  function never ran" or "enqueued < eligible after a partial dispatcher drain" — that
  periodic backstop reconciliation is **PR5** and will reuse `emitAnnouncementReachAlert`.
- The anti-silent guarantee depends on the audit/alert channel staying up; ADR
  20261110 hardened that to two independent channels and this reuses it.

## Alternatives considered

- **Raise `statement_timeout` on `service_role`/`authenticator`.** Rejected: global,
  weakens the protective 8s wall for every call; the repo precedent scopes the
  increase to the one heavy function.
- **Re-issue the full `CREATE OR REPLACE FUNCTION` with the attribute.** Rejected as
  larger than needed; `ALTER FUNCTION … SET` is the minimal change and matches
  `spf_rebuild_edges`.
- **Alert from the client instead of the server.** Rejected: the client is
  fire-and-forget and may be gone; the server signal is authoritative.
