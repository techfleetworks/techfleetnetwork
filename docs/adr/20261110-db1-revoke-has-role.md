# ADR 20261110 — DB-1 burndown batch 5: revoke anon EXECUTE on has_role

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (the gate + inventory), batches 1–4
  (20261110-db1-revoke-trigger-functions, -revoke-rpc-admin-mutations, -revoke-rls-helper-functions,
  -tighten-has-role-policies), ADR-0026 (expand/contract), ADR-0024 (prove at the owning layer),
  ADR-0036 (db push ≠ atomic with code deploy).

## Context

`has_role(uuid, app_role)` is the SECURITY DEFINER admin authz helper — the single highest-blast-radius
item in the DB-1 anon-exposed inventory, and the one batch 3 deliberately deferred. Batches 1–3 took the
list 76 → 30. Batch 4 (`20261111000000`) tightened the 9 implicit-PUBLIC RLS policies that referenced
`has_role` to `TO authenticated`, which is the prerequisite for this revoke: after batch 4, no anon/public
policy references `has_role`.

**Why anon exposure is wrong here.** A logged-out visitor should never be able to invoke the admin
authz helper. The exposure is the residual *direct* default-privilege grant to `anon` that
`REVOKE … FROM PUBLIC` does not remove (the batch-1 mechanism). `has_role` carries its own direct grants to
`authenticated` (20260430021322:7) and `service_role` (20260708050000), so removing anon leaves both
legitimate callers intact.

**The dependency.** This migration MUST apply after batch 4. If it applied first (or batch 4 regressed), an
anon-applicable policy would still reference `has_role` and the revoke would turn an anon query into
`permission denied for function`. Self-check #2 enforces that ordering by reading the live catalog.

## Decision

`REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC` (migration `20261111010000`),
and remove `has_role` from the completeness grandfather (30 → 29). Single overload confirmed.

**Three fail-closed self-checks, all run at prod `db push` against the live catalog:**
1. **Caller preservation** — `authenticated` AND `service_role` must retain EXECUTE on `has_role`; abort
   otherwise (the `, PUBLIC` side-effect guard).
2. **Anon-RLS safety, direct (load-bearing)** — no `pg_policies` row whose roles include anon/public
   references `has_role` in its own `qual`/`with_check`. Confirms batch 4 applied and no new anon/public
   `has_role` policy exists; a hidden/dashboard anon policy aborts the apply.
3. **Anon-RLS safety, transitive (load-bearing)** — no anon-reachable SECURITY INVOKER function
   (`has_function_privilege('anon', …, 'EXECUTE')` and `has_role` in `prosrc`) and no anon-SELECTable
   `security_invoker` view whose definition references `has_role`. This closes the gap the name-scan (#2)
   cannot see: such code runs `has_role` as the invoking role (anon), so it would need anon EXECUTE even
   though the token is not in any policy's own text. A plain view and a SECURITY DEFINER function run as the
   owner (which always retains EXECUTE) and are correctly excluded.

## Alternatives considered

- **Revoke before tightening the policies (no batch 4).** Rejected — breaks 9 live anon-applicable policies;
  batch 4 is the prerequisite.
- **`REVOKE FROM anon` only (not PUBLIC).** Rejected — consistent with batches 2–4, `, PUBLIC` guarantees
  removal; self-check #1 covers the side-effect on authenticated/service_role.
- **Rely on batch 4's name-scan guard alone.** Rejected — it cannot see a transitive invoker-function/view
  path; self-check #3 adds that at apply time (the judge-arch advisory on batch 4 asked batch 5 to close it).
- **Drop/rewrite `has_role`.** Rejected — out of scope; the function is correct, only its anon grant is wrong.

## Consequences

- `has_role` is no longer anon-executable; `authenticated`/`service_role`/owner unaffected. DB-1 backlog
  30 → 29, tracked by the gate. This completes the has_role two-step (batch 4 tighten → batch 5 revoke).
- **Prod impact:** applied by the migration pipeline on merge, AFTER batch 4 in the same forward sequence.
  Safe for expand/contract (no live caller loses access — proven by the three self-checks); reversible by
  re-`GRANT`; idempotent (re-revoke no-op; self-checks read-only). If prod has an anon/public policy (direct
  or transitive) that reaches `has_role`, self-check #2 or #3 **fails the apply** (fail-fast) — the intended
  safe outcome.
- **Limitation (honest):** Postgres could not be run locally — anon removal is proven by the CI `db-test`
  completeness run (grandfather 30 → 29) and caller/anon-RLS safety by the three in-migration self-checks
  (which also run at prod apply). The policy/function-reference analysis is `observed` from migration
  history. Self-check #3 scans function bodies via BOTH `pg_proc.prosrc` (dollar-quoted) AND
  `pg_get_functiondef` (SQL-standard `BEGIN ATOMIC`, where `prosrc` is empty), and view definitions via
  `pg_get_viewdef`, matching the standalone identifier `has_role` on a word boundary (`~* '\mhas_role\M'`)
  in non-system schemas — so the built-in `pg_catalog.pg_has_role` (whose symbol/name contains the
  substring `has_role`) is NOT matched, only a real reference to our `public.has_role`. A comment mentioning
  the bare word `has_role` would still cause a spurious, safe abort. It covers a multi-hop chain wherever each hop is independently anon-executable
  (the terminal fn/view carrying the `has_role` token is flagged). Residual gaps (all fail-safe — a miss
  would mean a missing abort, and the current transitive vector is clear: the only SECURITY INVOKER caller,
  `get_top_error_fingerprints`, is already anon-revoked and in no policy): the view scan matches only the
  `security_invoker=true`/`on` reloption spellings the repo uses (not hypothetical `1`/`yes`), and
  `app_role` in the REVOKE and `to_regprocedure` is schema-unqualified, so an apply without `public` in
  `search_path` makes `to_regprocedure` return NULL and self-check #1 abort (fail-closed, consistent with
  batches 1–4).
- **Gate strength (honest):** the `db-test` completeness suite is currently **informational** (RP-H TST-3
  tracks promoting it to blocking). The load-bearing anon-break guards here do not depend on that — they run
  at the actual prod `db push` and abort the apply.
- **Remaining DB-1 (the 29):** ops/monitoring fns (`get_stuck_pending_email_count`,
  `community_events_staleness_check`, `fill_content_gaps_check_and_inc`, `class_item_release`,
  `get_class_curriculum_for_learner`) + the missed trigger `trg_general_app_submitted`; intentional public
  RPCs kept; auth/rate-limit/provisioning and stats/KPI out of scope.
