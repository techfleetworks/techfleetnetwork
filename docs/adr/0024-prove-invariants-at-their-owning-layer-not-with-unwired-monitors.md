# ADR 0024 — Prove an invariant at the layer that owns it, not with an unwired after-the-fact monitor

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: ADR-0022 (every guard must be tested); ADR-0023 (guard tests must discriminate); `decisions.md §6`; the deleted guard `scripts/ci/check-no-opaque-script-error.mjs`; the owning DB trigger `reject_opaque_script_error` (migration `20260602194357`); the new pgTAP proof `supabase/tests/reject_opaque_script_error_test.sql`; the `db-test` CI job; the `judge-arch` skill.

## Context

The guard-test burn-down (ADR-0022) requires every `scripts/ci/check-*.mjs` to have a committed test that actually runs it, and ADR-0023's discrimination gate requires that test to **fail** when the guard is no-opped — so a vacuous, skip-only test is not allowed.

`scripts/ci/check-no-opaque-script-error.mjs` could not clear that bar, and looking at _why_ exposed a deeper problem than "it needs a test":

1. **It was unwired.** It appeared in no `.github/workflows/*` job. It ran nowhere, on no PR — it verified nothing. Its own header comment admitted this.
2. **It was redundant.** The invariant it policed — "no opaque cross-origin `Script error.` row is ever stored in `audit_log` / `agent_fix_queue`" — is _owned and enforced_ by a live `BEFORE INSERT` trigger, `reject_opaque_script_error`, which drops such rows at write time (migration `20260602194357`). The browser-side JS filter is only an early-drop optimization. The guard was a third, weaker, after-the-fact layer that queried for rows the trigger already makes impossible.
3. **It was untestable in CI by construction.** Its only logic was a live SQL query; with no database it can only skip (`exit 0`). A test asserting that skip is exactly the vacuous test the discrimination gate rejects. A real (non-zero) assertion needs a populated production database — not available to CI.

So "give it a test" was the wrong frame. A dead, redundant monitor should not be kept alive with a bespoke fixture seam invented solely to satisfy the gate — that adds complexity to preserve code that guards nothing.

## Decision

**Delete the unwired monitor, and prove the invariant behaviourally at the layer that owns it.**

1. Remove `scripts/ci/check-no-opaque-script-error.mjs` and its `guard-test-allowlist.json` entry (the allowlist shrinks by _removal_, honouring the shrink-only ratchet).
2. Add `supabase/tests/reject_opaque_script_error_test.sql` — a pgTAP suite that inserts opaque `Script error.` rows (bare, `error:`-prefixed, no-period, whitespace/leading-blank) into both `audit_log` and `agent_fix_queue` and asserts the trigger **drops** them, while a real stack-trace error and a message whose _first_ line is real are **kept**. The kept-row assertions make the test discriminate: neutralise the trigger and the suite fails. It runs in the already-wired `db-test` job (`supabase test db`) on every migration-touching PR.

This is the general rule the title states: **when an invariant is enforced at a specific layer (a DB constraint/trigger, a service boundary), prove it there — do not also maintain a separate monitor that re-checks the same fact from further away.** The owning layer is the single writer of that guarantee; the test belongs next to it.

## Considered options

- **(chosen) Delete the dead monitor; prove the trigger with pgTAP in the wired `db-test` job.** Removes dead/redundant code, and the invariant ends up _more_ verified than before — behaviourally, on every relevant PR, at its owning layer. Consistent with ADR-0022/0023 (allowlist shrinks by removal) and the global rule "leave no dead code behind."
- **Add a fixture/`--input` seam to the guard so it can be fed rows without a DB, then write a discriminating smoke test.** Rejected: it invents new surface area purely to keep an _unwired, redundant_ monitor testable. It would prove a re-implementation of the trigger's logic, not the trigger — the thing that actually enforces the invariant in production.
- **Keep it allowlisted with a written "DB-gated, can't test" justification.** Rejected: the ratchet is meant to reach zero, and this hides a real defect (a guard that runs nowhere) behind a permanent exception. The honest state is "there is no such guard," not "there is an untestable one."
- **Wire the monitor into a DB-backed CI job so it runs for real.** Rejected: it would still be a strictly weaker, after-the-fact duplicate of the trigger; the trigger + pgTAP proof already covers the invariant at write time. Two owners of one guarantee is exactly the data-ownership smell we avoid.

## Consequences

- **Positive:** one fewer piece of dead code; the invariant is proven behaviourally at its owning layer on every migration PR (stronger than an unwired scan); the allowlist drops legitimately (14 → the guard no longer exists); a reusable precedent — prove-at-the-owning-layer — is recorded for the next DB/env-gated guard the burn-down meets.
- **Negative / trade-offs:** the pgTAP proof runs only in the `db-test` job, which today is **informational** (not yet in the blocking `gate` aggregator) and runs only when `supabase/migrations/**` changes — so a regression to the trigger on a non-migration PR would not be caught until a migration PR or the promotion of `db-test` to blocking (tracked with the other pgTAP suites). This is still strictly better than the deleted monitor, which ran on _no_ PR. The trigger's _existence_ remains separately gated by the `audit-triggers` job (`check-audit-triggers.sh`).

## Confirmation

`supabase/tests/reject_opaque_script_error_test.sql` runs green under `supabase test db` in the `db-test` job and fails if the `reject_opaque_script_error` trigger is dropped or its predicate broken (the kept-row assertions flip). `scripts/ci/check-guard-has-test.mjs` and the discrimination gate no longer see the deleted guard; the allowlist no longer lists it.
