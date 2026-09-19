# ADR 0052 — The schema-gate baseline is a drop-only floor, not an exact band

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `scripts/ci/check-db-schema-present.mjs` (the ADR-0036 gate), `scripts/ci/_schema-floor.mjs` (new pure helper), `src/test/smoke/schema-floor.test.ts`. Third in the anti-conflict series (after ADR-0046 self-declared guard markers, ADR-0047 derived guard matrix); this one removes the last high-frequency source of per-merge gate churn. Supersedes the symmetric ±tol behavior introduced with ADR-0036. Skills: `arch-encode`, `enterprise-architecture-standards`, `compliance-data-lifecycle` (schema migration safety).

## Context and problem statement

The ADR-0036 schema-reconciliation gate pins a per-category derived-object **baseline** (tables=203, functions=423, columns=2056, …) as a tripwire: if extraction silently under-derives (a partial-capture regression), objects go unverified against prod and a committed-but-unapplied migration can ship green (the Discord PGRST202 outage class). The tripwire was a **symmetric band**: `Math.abs(derived − baseline) > BASELINE_TOL` (tol = 2).

The symmetric band made **any growth** a failure. Every unrelated migration that legitimately adds objects pushed the derived count above baseline+2, failing the gate and forcing a manual one-line baseline bump — and because the gate fails on the FIRST category over tol, a bump surfaced the next category, then the next (the #345 baseline whack-a-mole: `function` +3, then `column` +5, resolved only by re-syncing every category at once). This is exactly the per-merge central-value churn the anti-conflict series exists to remove: a single shared number every schema PR must edit.

## Decision drivers

- **Remove the churn structurally.** A schema PR that adds objects must not have to touch a baseline number.
- **Keep the real protection.** The tripwire exists to catch a DROP (partial-capture / silent under-verification). That must still fail closed.
- **Don't weaken the gate.** Relaxing the upper bound must not open a new false-green.

## Considered options

1. **Keep the symmetric ±tol band.** Rejected: it _is_ the churn source.
2. **Auto-bump the baseline to the derived count on every run.** Rejected: a self-modifying gate value committed on every PR is the same manual churn wearing a hat, and an auto-raise would happily ratchet right past a real drop.
3. **Drop-only floor (chosen).** The baseline is a FLOOR: fail only when `derived < floor − tol` (a real shrink). Growth never fails. A phantom over-derivation is still caught — downstream, by the declared-vs-prod reconciliation (a derived object absent from prod fails the gate regardless of the count).

## Decision outcome

**Chosen: Option 3.** The per-category comparison moved to a pure, unit-tested helper `_schema-floor.mjs` (`floorReport(cats, floors, tol)`), and `check-db-schema-present.mjs` calls it: a category whose derived count fell more than `tol` below its floor is a **drop** (FAIL — under-verification regression); an active category with no floor is **noFloor** (FAIL — a new category must ship with a tripwire); a count above its floor is **grown** (benign, an advisory notice to optionally raise the floor). All violations are reported together, so a drop no longer surfaces one category at a time.

The upper-bound loss is safe: a spurious _rise_ (extractor mints phantom objects) is caught by the existing "declared object absent from prod" check, which is the gate's core assertion — the baseline never needed to catch rises for correctness, only to force maintenance.

## Consequences

**Good**

- A schema migration that adds objects no longer trips the gate or requires a baseline edit — the #345 whack-a-mole is gone.
- The drop tripwire (the real protection against silent under-verification) is unchanged and now reported for all categories at once.
- The comparison is a pure function with direct unit tests, where before it was inline logic only reachable against live prod.

**Bad / accepted**

- A floor drifts below actual as the schema grows, so drop-detection is measured from the pinned watermark, not today's height, until someone opts to raise it (advised on every run). Accepted — catastrophic drops still fail; tightening is a deliberate, low-frequency choice, not per-PR toil.
- Lowering a floor (a deliberate object removal) is a reviewed edit in the same PR — visible in the diff, not silent. Accepted.

## Confirmation

- `src/test/smoke/schema-floor.test.ts` (6 scenarios) pins the semantics: a drop beyond tol fails; a drop within tol does not; growth never fails; exactly-on-floor is clean; a missing floor fails; drops/growth/missing are reported together. Previously the corpus baseline had NO test (the gate's smoke tests all run under `DB_SCHEMA_ROOT`, which skips it).
- The real corpus derives at its floors (extract-only: trigger 198 / policy 493 / column 2056 = their floors), so the gate stays green. `check-ci-guard-integrity`, `check-guard-has-test`, `verify-guard-test-discrimination`, and `arch-gate` all pass.
