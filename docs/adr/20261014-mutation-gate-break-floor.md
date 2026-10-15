# Mutation gate: ratchet the break floor off zero and guard it armed

- Status: accepted
- Date: 2026-10-14
- Deciders: engineering (CI-refactor wave 1, HIGH fix)

## Context

The product-code mutation gate (`stryker.conf.json`, `.github/workflows/mutation.yml`) was added in
the Oct-2026 audit and fixed for a timeout in `20261014-mutation-gate-static-mutant-timeout.md`. But
it still shipped with `thresholds.break: 0`, which **can never fail**: Stryker runs over
`src/lib/security.ts`, produces a real mutation score, and the job passes no matter how low that score
is. The audit's own coverage matrix flagged this as a vacuous gate — a false green of exactly the kind
`decisions.md` §6 forbids. A green check on this gate told the reader nothing.

The real score is known, not guessed. The successful mutation run on `main`
(`gh run view 38606574379`, 2026-10-14) measured **security.ts mutation score = 43.84%** (606 killed,
623 survived, 157 no-coverage, 3 timed out, of 1,389 mutants), completing in ~14 minutes within the
30-minute job budget. 43.84% is a low score — the tests miss nearly half of real breakage — but it is
the honest current floor.

## Decision

1. **Ratchet `thresholds.break` from 0 to 40.** This is the measured 43.84% minus a ~4-point margin.
   The margin exists because 3 mutants timed out this run, timeouts score as not-killed, and timeout
   counts drift run-to-run on a shared CI runner; a floor pinned exactly at 43.84 would risk a false
   red when a couple more mutants time out. 40 fails on real regressions without flaking on timing
   noise. **Intended policy:** the floor only ever rises as the real score climbs. **Enforced now:**
   the armed guard (below) rejects a non-positive or missing `break`, so the gate cannot be returned to
   its vacuous state. It does **not** yet stop a lower-but-positive value (e.g. 40 → 1); a shrink-only
   ratchet that compares `break` against its previously committed value is planned as follow-up PR 1.2,
   mirroring the repo's existing shrink-only guards. Until then, lowering the floor is caught by review,
   not by the guard.

2. **Keep the scope at `src/lib/security.ts` only, for now.** The single-file run already uses ~14 of
   the 30 available minutes; adding targets risks re-blowing the budget and each needs its own
   measurement. Expanding `mutate` is deliberate follow-up, one or two well-tested decision modules at
   a time, with the workflow `paths:` trigger expanded in lockstep.

3. **Add a fail-closed guard, `scripts/ci/check-mutation-gate-armed.mjs` (MUT-GATE-001, lane
   `critical`).** It fails CI if `thresholds.break` is <= 0 or missing, if `mutate` is empty, or if the
   mutation workflow silences its Stryker run with `|| true` / `|| :` / `continue-on-error: true`. This
   makes re-disarming the gate (the exact regression this ADR reverses) impossible to merge. It mirrors
   the existing `check-lighthouse-gate-armed` pattern and is pinned by a discrimination test
   (`src/test/smoke/check-mutation-gate-armed.smoke.test.ts`) proving it goes red when the gate is
   disarmed and fails closed when its inputs are missing.

## Consequences

- The mutation gate can now fail: a change that drops security.ts's mutation score below 40 turns the
  mutation job red. To make it merge-blocking for everyone, it still must be added to the
  `main-security-gates` ruleset's required checks (a one-time admin action; the armed guard itself
  already rides the blocking `lint-arch-critical` matrix).
- This does **not** make security.ts well-tested. 40% means the tests still miss most logic mutations.
  Raising the real score (writing tests to kill the 623 survivors) and ratcheting `break` upward in
  locked steps toward ~85% is separate, planned follow-up work.
- The armed guard prevents silent re-disarming; intentionally retiring the mutation gate now requires a
  deliberate ADR, not a quiet config edit.
