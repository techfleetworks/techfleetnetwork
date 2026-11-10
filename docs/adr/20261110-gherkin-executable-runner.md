# Gherkin scenarios are executable and gated, not documentation

- Status: Accepted
- Date: 2026-11-10
- Deciders: TechFleet (owner)
- Relates to: re-audit 2026-10-30 findings **BDD-1 / BDD-2** (RP-G); [decisions.md §6](../../decisions.md) ("Gate integrity — a check must fail closed"); skills `bdd-comprehensive-testing`, `verifiable-quality-gates`, `comprehensive-test-strategy`. Builds on ADR-0047 (self-declared CI lanes) and ADR-0046 (self-declared bespoke-dir-reader markers).

## Context and problem statement

The repo holds 106 Gherkin scenarios across 12 `.feature` files, co-located with the code they
describe (`supabase/functions/**`, `src/features/**`). They were written as the behavioural spec for
edge functions and security invariants — but **nothing executed them**. There was no
`@cucumber/cucumber`, no step definitions, no runner, and no CI job. The existing `bdd-gate.yml`
only greps that a changed module is *referenced* by some test file; it never runs a scenario.

So the scenarios were documentation that reads like tests: a false green of "we have BDD coverage"
(re-audit 2026-10-30, BDD-1·BDD-2). A scenario that parses but is bound to no code proves nothing,
and a regression to the described behaviour would not redden any scenario.

## Decision drivers

- **Prevent by construction → fail-closed gate → discrimination test** (the repo's hardening bar).
- **Execute real code, not a stand-in.** A runner that lints `.feature` files without binding them
  to production code is the same false green in a new coat.
- **Never a vacuous green.** A runner that runs zero scenarios (all excluded/pending) must fail, not
  pass. This is the exact defect the guard fleet exists to prevent (decisions.md §6).
- **Pending work stays visible.** The 98 scenarios that need the Deno/Supabase/live-upstream surface
  cannot all be made green today; they must be *tracked*, never silently skipped.
- **Auth is out of scope.** A separate workstream owns the auth refactor; auth features must not run
  in this gate.
- **Match the repo's conventions.** Co-located `.feature` files; `check-*`/`emit-*` guard scripts
  with self-declared CI lanes; a blocking `gate` aggregator.

## Considered options

1. **Keep `bdd-gate.yml`'s grep-for-a-test-reference.** Rejected: it is the false green — it never
   executes a scenario, so the behavioural contract is unenforced.
2. **Add cucumber-js and try to make all 106 green at once.** Rejected: most scenarios need a live
   Deno/Supabase/upstream surface (Discord, Figma, Resend, storage, async pipelines). Faking that to
   go green would re-create the "tests that test a stand-in" defect.
3. **Narrow the runner to only the implemented features; ignore the rest.** Rejected: the pending
   scenarios would be invisible — silently skipped, the exact failure `bdd-comprehensive-testing`
   forbids.
4. **Strict runner over the implemented subset + a committed, generated datastore that tracks the
   pending remainder, both gated (chosen).**

## Decision outcome

**Chosen: Option 4.**

- **Runner.** `@cucumber/cucumber@13.2.1` (pinned exact), config in `cucumber.mjs`, step definitions
  and a World under `features/` (TypeScript, loaded via the `tsx` ESM loader). `npm run test:bdd`
  runs **strict** (an undefined/pending step is a hard failure) over the `not @pending and not @auth`
  subset; `npm run test:bdd:all` drops the filter to surface the pending backlog's undefined steps on
  demand (a worklist, not a gate).
- **Executable subset (8 scenario-definitions, genuinely green).** The two features whose behaviour is
  pure and runtime-agnostic — `html-to-text` (5) and `prompt-injection` (3 of 4) — execute the **real**
  `supabase/functions/_shared/*` modules the edge functions import, with no Deno/Supabase/network.
  (A `Scenario Outline` is one definition but runs per `Examples` row, so the subset executes as 15
  cases / 49 steps.)
- **Pending remainder (98), visibly tracked.** Every not-yet-wired feature carries a feature-level
  `@pending` tag and a row in the generated datastore `features/bdd-index.json` with
  `status: pending`. The auth feature carries `@auth` and `status: excluded-auth`.
- **Datastore.** `scripts/ci/emit-bdd-index.mjs` derives `features/bdd-index.json` (machine) from the
  `.feature` files — the files stay the single source of truth; `features/INDEX.md` is the
  human-readable view with the declared audience enumeration (anonymous, authenticated, admin,
  api-consumer, partner, internal).
- **Gate.** A new **blocking** `bdd` job in the required `gate` aggregator runs
  `scripts/ci/check-bdd-runner.mjs` (datastore reconciliation) then `npm run test:bdd` (strict
  execution). The guard (`ci-lane: bespoke`, wired by its own step) fails closed on index drift, a
  feature with no declared audience, an `@auth` feature that would execute, or an **empty** executable
  set. It is pinned and discriminated by `src/test/smoke/check-bdd-runner.smoke.test.ts`.

## Consequences

**Good**

- The behavioural contract for the pure security modules is now **executed on every push** and reds
  on a real regression — proven by discrimination (below).
- The pending backlog is counted and visible in one committed place; a new feature cannot be added
  without a tracked status and an audience, and the executable set can never silently fall to zero.
- Auth features are structurally excluded from this gate, so this work does not collide with the auth
  refactor.
- Adds the runner with the repo's own idioms (co-located features, `emit-*`/`check-*`, self-declared
  CI lane, blocking aggregator) — a new guard never edits the `ci.yml` matrix lists.

**Bad / accepted**

- Only 8 of 106 scenario-definitions execute today; 98 remain `@pending`. This is an honest partial —
  the remainder needs a Deno/Supabase harness that is itself follow-on work. It is tracked, not hidden.
- The full `bdd-comprehensive-testing` ideal (per-scenario `@audience/@usecase/@category/@quality/
  @severity` taxonomy, `check-bdd-tags`, `check-gherkin-valid` as a separate parser gate, an
  append-only coverage log) is **not** implemented here; strict cucumber-js already parses with the
  official Gherkin parser and fails on undefined steps, which covers legality + execution for the run
  set. The taxonomy/log layers are tracked follow-ups, stated rather than silently skipped.
- The datastore reconciliation uses a line-based feature parse (count/tags/status), not the full
  Gherkin AST — sufficient for drift/status/vacuity, and noted as a limitation.
- The **datastore guard** has a committed discrimination test (`check-bdd-runner.smoke.test.ts`), but
  the **cucumber runner's** red-on-broken-step property is proven `observed` (manual, in Confirmation)
  rather than by a committed automated test. It is structurally held by strict mode (an undefined /
  pending step is a hard failure) plus the non-vacuous executable-set check, so the gap is theoretical;
  a fixture-based runner-discrimination test is a stated follow-up alongside the taxonomy/log layers.

## Confirmation

Evidence discipline (`skeptical-audit`): each claim carries a state + a re-runnable source.

- **The runner executes real code and passes** — `observed`: `npm run test:bdd` → "15 scenarios (15
  passed), 49 steps (49 passed)", exit 0.
- **The gate reds on a broken step (discrimination)** — `observed`: inverting the
  prompt-injection assertion → "15 scenarios (9 passed, 6 failed)", exit 1; restoring → exit 0.
- **The datastore gate fails closed on drift / vacuity** — `observed`: mutating
  `features/bdd-index.json` → `check-bdd-runner` exit 1 ("datastore is STALE"); an all-`@pending`
  fixture → exit 1 ("executable set is EMPTY"); clean repo → exit 0.
- **The guard is itself pinned + classified + wired** — `observed`: `check-guard-has-test`,
  `check-guards-wired`, `check-ci-guard-integrity`, `emit-guard-matrix` all green with
  `check-bdd-runner.mjs` present (`bespoke` lane, committed smoke test).
- **Auth is excluded** — `proven` by the gate: `check-bdd-runner` asserts every `@auth` feature has
  `status: excluded-auth` and 0 executable scenarios, and `test:bdd` filters `not @auth`.

**Limitations (stated):** 98 scenarios are `@pending` (not executed); the taxonomy/append-only-log
layers of `bdd-comprehensive-testing` are follow-ups; the datastore parse is structural, not full-AST.
