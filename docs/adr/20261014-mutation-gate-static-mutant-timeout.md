# Mutation gate: ignore static mutants and scope the trigger to the mutated target

- Status: accepted
- Date: 2026-10-14
- Deciders: engineering (surfaced by PR #440 CI)

## Context

The product-code mutation gate (`.github/workflows/mutation.yml`, `stryker.conf.json`,
added in the Oct-2026 audit) runs StrykerJS over `src/lib/security.ts` and fails when the
mutation score drops below `thresholds.break`.

PR #440 (a Welcome Flow change that touches `src/lib/validators/`) was the first PR in a
while to match the workflow's `paths: src/lib/**` trigger, so the gate actually ran — and
was **canceled after the 30-minute job timeout**. The Stryker log shows the real cause:

```
Found 1 of 3092 file(s) to be mutated.
Instrumented 1 source file(s) with 1389 mutant(s)
WARN Detected 259 static mutants (19% of total) estimated to take 99% of the time
```

`security.ts` is 1,209 lines and yields 1,389 mutants, **259 of them "static"** —
top-level constants and regexes evaluated at module load. Under `coverageAnalysis:
"perTest"`, Stryker cannot attribute a static mutant to any single test, so each one
re-runs the **entire** suite. 259 full-suite runs → a ~9–11h estimate → the job cancels
at 30 min. The gate therefore never produced a score; it was a latent false-red that only
rare `src/lib/**` PRs triggered. The required `gate` aggregator was unaffected (it does not
depend on this job), so no PR was actually blocked — but the gate was non-functional.

## Decision

1. **`"ignoreStatic": true`** in `stryker.conf.json`. Static mutants are the 99% time
   sink and, per Stryker's own guidance, are the standard thing to drop under `perTest`.
   The run then completes well within the job timeout on the ~1,130 non-static mutants.
2. **Scope the workflow trigger to the mutated target.** `paths` changes from `src/lib/**`
   to `src/lib/security.ts` (plus the config and the workflow). The trigger must match
   `mutate`, or an unrelated `src/lib` change launches a full `security.ts` campaign for
   nothing. The list is expanded in lockstep whenever `mutate` grows.

`thresholds.break` stays `0` for now — ratcheting it off 0 (capturing a real score and
setting `break` a few points under it) is tracked separately and is unaffected by this fix.

## Consequences

- The mutation gate can run to completion within its CI budget — it is a functioning gate,
  not a 30-minute cancel. Ratcheting `break` is now possible because a score can be captured.
- Static mutants in `security.ts` are not mutation-tested. They are overwhelmingly constants
  and patterns, the lowest-value mutation targets; the trade-off is explicit here.
- A gate whose trigger does not match its scope is a repo-agnostic footgun. The enterprise
  mutation-gate scaffold (techfleetworks/enterprise-software-AI-skills) should ship
  `ignoreStatic: true` by default, keep `paths == mutate`, and add a preflight that bounds a
  run to the CI timeout (dry-run mutant count + estimate, fail fast with guidance) so
  "the gate can run to completion" is proven, not just "the gate can detect"
  (`verifiable-quality-gates`). Filed as the structural follow-up.
