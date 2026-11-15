# ADR 20261110 — DB-1 burndown batch 3: revoke anon EXECUTE on RLS-helper functions

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR 20261110-db1-anon-definer-completeness (the gate + inventory), batches 1
  (20261110-db1-revoke-trigger-functions) and 2 (20261110-db1-revoke-rpc-admin-mutations), ADR-0026
  (expand/contract), ADR-0024 (prove at the owning layer), ADR-0036 (db push ≠ atomic with code deploy).

## Context

Batches 1 (18 triggers) and 2 (20 rpc mutations) took the anon-exposed DEFINER inventory 76 → 38. The next
tranche is the **SECURITY DEFINER authz helpers**: `is_class_owner`, `is_enrolled_in_class`,
`is_class_learner`, `can_read_class_module_file`, `can_write_class_module_file`, `handoff_is_active_member`,
`_assert_class_editor`, `_learner_cohort_start`, and `has_role`. These are the riskiest to revoke.

**The specific risk.** When an RLS policy's `USING`/`WITH CHECK` expression calls a function, the *querying
role* must hold `EXECUTE` on that function for the query to run — `SECURITY DEFINER` changes the execution
context *after* invocation, not the right to invoke. So if `anon` could query a table whose policy calls one
of these helpers, revoking anon's `EXECUTE` would turn an anon read into `permission denied for function`.

**And a measurement limitation.** Proving the safe case means proving a *negative* ("no anon-reachable
policy calls this helper"), and the authoritative source is the live `pg_policies` catalog. The CI test DB
may not mirror prod's full policy set (some policies are defined via the Supabase dashboard, outside
migration history), so a repo-only analysis cannot by itself guarantee prod safety.

## Decision

Revoke `EXECUTE … FROM anon, PUBLIC` on **8** of the 9 helpers (migration `20261110230000`), grandfather 38
→ 30. Classified by evidence (`observed`, on this branch):

- **6 policy-helpers** — `is_class_owner`, `is_enrolled_in_class`, `is_class_learner` (class_module_* tables),
  `can_read_class_module_file`, `can_write_class_module_file` (storage.objects `class-module-files`),
  `handoff_is_active_member` (handoff_* tables + `handoff-deliverables` storage). **Every** policy that
  references them is declared `TO authenticated`; none is `TO anon`/`TO public`. The querying role for those
  policies is `authenticated`, which keeps its own direct grant.
- **2 nested-only helpers** — `_assert_class_editor`, `_learner_cohort_start`: referenced in **no** RLS
  policy, only `PERFORM`ed inside other SECURITY DEFINER functions (the nested call runs as the outer
  function's definer/owner, never as the invoking role). No role but the owner needs EXECUTE.

All 8 already carry `REVOKE ALL … FROM PUBLIC` + (the 6) `GRANT … TO authenticated, service_role` in their
definitions — the authors already intended authenticated/service_role only, and the anon exposure is the
residual *direct* default-privilege grant that `REVOKE … FROM PUBLIC` does not remove (the batch-1
mechanism). This batch aligns the grant with that intent.

**Two fail-closed self-checks, both run at prod `db push` against prod's live catalog** (not just CI):
1. **Caller preservation** — assert `authenticated` retains `EXECUTE` on the 6 policy-helpers (it evaluates
   their TO-authenticated policies); abort otherwise. The 2 nested-only helpers run as the owner, which
   always retains, so they need no role assertion.
2. **Anon-RLS safety (load-bearing)** — assert **no** `pg_policies` row whose roles include `anon` or
   `public` references any of the 8 helper names. Because it reads prod's real catalog at apply time, a
   hidden/dashboard-defined anon policy referencing a helper **aborts the migration** instead of silently
   breaking an anon read. This closes the CI-vs-prod gap. It matches on the bare helper name (the safe
   direction: a false match only causes a spurious abort, never a silent break).

`has_role(uuid, app_role)` is **deliberately excluded** (kept in the grandfather): it is referenced by far
more policies (hundreds) and is the highest-blast-radius helper. If it is referenced by even one anon/public
policy, self-check #2 would (correctly) abort the whole migration — so it gets its own dedicated audit later
rather than risking this batch.

## Alternatives considered

- **Include `has_role`.** Rejected for now — too broad; a single anon/public reference would abort the
  batch, and the blast radius warrants a dedicated pass.
- **Measure-only (ship a diagnostic, revoke later).** Rejected as insufficient on its own — a CI diagnostic
  can't see prod-only policies. The in-migration self-check #2 is strictly stronger: it enforces the same
  invariant at the actual prod apply.
- **Revoke `FROM anon` only (not PUBLIC).** Rejected — consistent with batches 1–2, `, PUBLIC` guarantees
  removal; self-check #1 covers its side-effect on `authenticated`.
- **Lock these helpers to `service_role` only.** Rejected — `authenticated` genuinely needs EXECUTE to
  evaluate the TO-authenticated policies that call the 6; removing it would break member reads.

## Consequences

- 8 RLS-helper functions no longer anon-executable; `authenticated`/`service_role`/owner unaffected. DB-1
  backlog 38 → 30, tracked by the gate.
- **Prod impact:** applied by the migration pipeline on merge. Safe for expand/contract (no live caller
  loses access — proven by both self-checks); reversible by re-`GRANT`; idempotent (re-revoke no-op,
  self-checks read-only). If prod has an anon/public policy referencing a helper that the repo doesn't show,
  self-check #2 **fails the apply** (fail-fast), which is the intended safe outcome.
- **Limitation (honest):** I could not run Postgres locally — anon removal is proven by the CI `db-test`
  completeness run (grandfather 38 → 30) and caller/anon-RLS safety by the two in-migration self-checks
  (which also run at prod apply). The policy-reference analysis is `observed` from migration history.
  Self-check #2 scans `pg_policies.qual`/`with_check` text for a helper *by name*, so it does **not** see a
  helper reached **transitively** — e.g. an anon/public policy that calls a `SECURITY INVOKER` wrapper
  function whose *body* calls one of the 8 (the invoker would then need anon EXECUTE, but the helper name is
  not in the policy text). It also does not see a helper invoked as anon via a `security_invoker` view, a
  CHECK constraint, or a generated column. The fresh-context review confirmed **none of these vectors exists
  in the repo today** (the full reference set is 18 files; the intentional anon/public RPCs do not reference
  any of the 8; the two anon-exposed RPCs that transitively reach a helper — `get_class_curriculum_for_learner`,
  `class_item_release` — are both `SECURITY DEFINER`, so the nested calls run as the owner, not anon). These
  are listed as the residual the name-scan cannot catch, not known gaps.
- **Gate strength (honest):** the `db-test` completeness suite that proves the 38 → 30 shrink is currently
  **informational** (not a required CI check), so the burn-down ledger could regress without blocking a
  merge. Promoting `db-test` to blocking is tracked separately (RP-H TST-3, gated on a green baseline). The
  **load-bearing** anon-break guard here does not depend on that: self-check #2 runs at the actual prod
  `db push` and aborts the apply, which is stronger than a CI check for the anon-break invariant.
- `is_enrolled_in_class` is grouped with the policy-helpers above, but its RLS-policy references were
  superseded by `is_class_learner` (`20260808160200`); it is now effectively nested-only. It is still
  granted to `authenticated` and covered by self-check #1, so the revoke and assertion are correct either way.
- `has_role` and the ops/trigger tranches remain in the grandfather.
