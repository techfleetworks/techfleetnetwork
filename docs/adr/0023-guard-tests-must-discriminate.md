# ADR 0023 — Guard tests must discriminate (a mutation gate), and the quality discipline is written down

- Status: Accepted
- Date: 2026-08-29
- Deciders: TechFleet (owner)
- Related: ADR-0022 (every guard must be tested); `decisions.md §6` (gate integrity); the enforcing job `scripts/ci/verify-guard-test-discrimination.mjs`; the coverage guard `scripts/ci/check-guard-has-test.mjs`; the meta-guard `scripts/ci/check-ci-guard-integrity.mjs`; the new `AGENTS.md`; the `judge-arch` skill.

## Context

ADR-0022 made every CI guard have a committed test. But "has a test that runs it" is weaker than "has a test that _proves_ it works." A test can exec a guard and assert nothing that depends on the guard's detection — a **vacuous** test — and a later regression that breaks the guard (a bad regex, an inverted condition) would then ship **green**: the guard passes, the gate passes, a real violation merges. During this work, an adversarial review (`judge-arch`) caught exactly this class twice — a coverage guard that counted comment mentions as coverage, and a cross-credit hole — before they merged.

Two quality mechanisms have been catching these problems:

1. **`judge-arch`** — an LLM adversarial review the agent runs from `CLAUDE.md`/`AGENTS.md`. It catches semantic defects a regex can't. But it is a **convention** (agent-run), not a CI gate: a human-opened PR, or an agent that ignores the playbook, doesn't get it.
2. **Manual mutation** — breaking a guard and confirming its test reddens. Powerful, but done by hand.

The most valuable thing judge-arch keeps catching here — the _vacuous test_ — is mechanizable. So we mechanize it, and we write the surrounding discipline down so it survives the session that discovered it.

## Decision

1. **A guard's test must DISCRIMINATE, enforced mechanically.** `scripts/ci/verify-guard-test-discrimination.mjs` (blocking, in the CI `gate`) replaces every tested guard with a NO-OP (`process.exit(0)`), runs the guard smoke suite once, and requires **every** guard's test to FAIL. A test that still passes against a no-op guard asserts nothing about the guard's behaviour — it is vacuous — and CI blocks the merge. The job restores every guard in a `finally`; it fails closed on any missing input (guards dir, test tree, allowlist, an unmapped tested guard). It is a mutation-testing _job_, not a scanning guard, so it does not recurse through `check-guard-has-test`/the meta-guard; its correctness is proven by its own required CI run on the real corpus plus fail-closed unit fixtures.
2. **Write the discipline down where every agent/teammate reads it** — `AGENTS.md` at the repo root: the four questions, run `judge-arch` before "done", prove-your-gate-discriminates, no-vacuous-tests, fail-closed, the shrink-only ratchet. So the adversarial, discrimination-first bar is inherited, not rediscovered — the same intent as `decisions.md` and the global `CLAUDE.md`.
3. **Name the last convention-only gap.** `judge-arch` remains agent-run, not a CI gate. Closing it fully means an LLM-review GitHub Action that runs its rubric on every diff. `AGENTS.md` records this as help-wanted; the mutation gate already converts the highest-value part (vacuous tests) into a deterministic CI gate.

## Considered options

- **(chosen) A mutation gate (no-op each guard, require its test to fail) + a written playbook.** Deterministic, runs on every PR, no LLM. Catches the vacuous-test class mechanically; the playbook carries the rest.
- **Rely on judge-arch alone.** Rejected — convention-only; skipped exactly when under pressure or on human PRs; the thing it best catches (vacuous tests) is mechanizable, so it should be mechanized.
- **A structural lint (require a `.toBe(1)` in each guard test).** Rejected as the _primary_ mechanism — it proves an assertion's shape, not that the fixture truly triggers the guard; a `.toBe(1)` on a fail-closed fixture would pass it. Mutation proves the test actually depends on the guard's detection.
- **Full per-mutant mutation testing (mutate each regex/branch).** Rejected as over-engineering now — the no-op mutant catches the real failure mode (a broken/removed guard shipping green) at a fraction of the cost; can be revisited if warranted.

## Consequences

- **Positive:** a broken guard can no longer ship a false green — the exact live proof (break a guard → its test reddens) is now automated for every guard, every PR, deterministically, for every teammate/agent. The playbook makes the whole adversarial discipline transferable "at a snap." The gate grows coverage automatically as the burn-down proceeds.
- **Negative / trade-offs:** the job mutates guard files in place during its run (always restored in a `finally`; safe under CI's ephemeral checkout, and a killed local run is repaired by `git checkout scripts/ci`). It runs the guard smoke suite an extra time (~tens of seconds), so it lives in a dedicated CI job. It depends on `vitest` (already the test runner) and, being a job rather than a `check-*` guard, is intentionally exempt from `check-guard-has-test`; its fail-closed paths are unit-tested and its mutation behaviour is verified by the required real-repo CI run. `judge-arch` staying convention-only is an accepted, named residual until the LLM-review Action lands.

## Confirmation

`scripts/ci/verify-guard-test-discrimination.mjs` runs green in CI (the fitness function) and reddens the moment any guard's test goes vacuous; `src/test/smoke/verify-guard-test-discrimination.smoke.test.ts` pins its fail-closed behaviour. Demonstrated this session: on the real repo it reports every tested guard's test discriminates, and injecting a happy-path-only test makes it fail.
