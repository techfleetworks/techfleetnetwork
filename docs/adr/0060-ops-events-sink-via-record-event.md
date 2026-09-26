# ADR 0060 — Email-v2 telemetry writes via record_event, not a direct ops_events insert

- Status: Accepted
- Date: 2026-09-22
- Deciders: Morgan Denner
- Epic: Observability / Email subsystem v2

> Numbering: main is at ADR-0056; 0057 (project-openings completed history / hackathons tab),
> 0058 (applicant-status event fan-out) and 0059 (applicant-status fail-proof rearchitecture)
> are reserved by in-flight branches, so this takes 0060.

## Context

Production Supabase logs (project `pzvqxdgoztbfikfuifix`) showed `POST /rest/v1/ops_events`
returning **HTTP 400 at volume** — 63 in a one-hour window, user-agent `Deno/2.1.4` (edge
functions). A PostgREST 400 on an insert means the row was **rejected and dropped**, so the
email-v2 ops/telemetry stream was silently going nowhere.

The writer was the email-v2 telemetry sink:

```ts
// supabase/functions/_shared/email/infrastructure/ops-event-sink.ts (before)
await supabase.from("ops_events").insert({
  kind,
  severity,
  source,
  payload,
  occurred_at: new Date().toISOString(),
});
```

`public.ops_events` (base migration `20260602230329`; mirrored in generated `types.ts`) has
columns `id, event_day, occurred_at, kind, severity, actor_id, ref_table, ref_id, payload,
expires_at` — and **no `source` column**. Sending a top-level `source` makes PostgREST reject the
row with **PGRST204** ("Could not find the 'source' column … in the schema cache") → HTTP 400.

Two things made it _silent_: (1) `supabase-js` `.insert()` returns `{ error }` rather than
throwing, so the sink's `try/catch` never even fired its `console.warn`; (2) `emit` is
fire-and-forget, so nothing downstream noticed. Every `email.enqueued`, `email.attempt.*`, and
`email.enqueue.suppressed` event was lost — the entire email-v2 observability signal.

This sink was the **only** direct `.from('ops_events').insert()` in the codebase. Every other
edge-function writer (`record-auth-event`, `record-auth-recovery`, `record-auth-wedge`) already
goes through the `record_event(p_sink, p_kind, p_actor, p_payload, p_severity, p_ref_table,
p_ref_id)` RPC — the documented **single write path** for `ops_events` / `ops_metrics` /
`audit_log`. The sink was the one place that bypassed it, and bypassing it is exactly how it drifted
out of sync with the table shape (nothing validated the columns it named).

## Decision

Route the sink through the canonical `record_event` RPC and carry `source` inside the `payload`
JSONB, where event metadata belongs:

```ts
// after
const { error } = await supabase.rpc("record_event", {
  p_sink: "ops_events",
  p_kind: kind,
  p_severity: severity,
  p_payload: { ...payload, source },
});
if (error) console.warn("ops_events emit failed", { kind, err: error.message });
```

This is a **contract of the writer**, not an expansion of the schema: no migration, no prod DB
change. It fixes the 400, removes the last rogue second write path (restoring the single-writer
invariant), and now _reports_ an RPC error to the edge logs instead of swallowing it. `occurred_at`
becomes the table's `now()` default (rows are inserted inline at emit time, so the difference is
sub-millisecond — and every other `record_event` caller already relies on that default).

Proven twice, red → green:

- `supabase/functions/_shared/email/infrastructure/ops-event-sink.test.ts` (Deno unit, wired into
  the `deno-check` job's allowlist in `ci.yml`): asserts the sink calls `record_event` (not a direct
  insert), folds `source` into `payload` and never names it as a top-level column, honours a custom
  source, reports a returned RPC error, and never throws. Fails against the old direct-insert shape.
- `supabase/tests/ops_events_record_event_test.sql` (pgTAP, `db-test` job): asserts `ops_events` has
  **no** `source` column, that a raw insert naming `source` throws `42703` (the SQL mirror of the
  400), and that `record_event('ops_events', …)` as `service_role` succeeds with `source` preserved
  in `payload`.

## Alternatives considered

- **Expand the schema: add a `source` column to `ops_events` (and a `p_source` to `record_event`).**
  Rejected. It's the bigger, riskier change (a hand-applied prod migration + a `record_event`
  signature change, which the migrations rules treat as a contract/expand-contract dance), and it's
  unjustified: nothing reads a top-level `source` (dashboards read `kind/severity/occurred_at/
payload`; no view or query references `ops_events.source`), and the value is a constant subsystem
  tag that fits cleanly in `payload`. Adding a first-class column for a single constant is building
  for a future we don't have.
- **Minimal patch: keep the direct insert, just move `source` into the inserted `payload`.** Rejected.
  It fixes the 400 but leaves the direct insert — the second write path that caused the drift — in
  place, to drift again the next time the table shape changes. Routing through `record_event` fixes
  the bug _and_ the boundary violation for the same-sized diff.

## Consequences

**Positive**

- Email-v2 telemetry is written again; the 400s stop.
- One write path for `ops_events` across all edge functions (data-ownership invariant restored).
- RPC errors are now surfaced in edge logs, so a future shape mismatch is visible, not silent.

**Negative / accepted**

- `occurred_at` is now the DB `now()` default rather than a client timestamp — an accepted,
  sub-millisecond change consistent with every other `record_event` caller.
- `db-test` (pgTAP) only runs when a PR touches `supabase/migrations/**`; this PR does not, so the
  DB-contract suite runs as a **regression guard on future migration PRs** (e.g. any attempt to
  drop/rename an `ops_events` column or the RPC), not on this PR. The Deno unit test _does_ run on
  this PR (the change is under `supabase/functions/**`).
- **Deploy:** edge-function-only change; ships via `deploy-edge-functions.yml` on merge (a
  `_shared/**` change redeploys all functions). No migration to hand-apply. Rollback is a revert —
  the old direct insert simply resumes being dropped, no worse than today.
