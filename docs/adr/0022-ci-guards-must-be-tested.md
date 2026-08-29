# ADR 0022 — Every CI guard must be pinned by a committed test

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: `decisions.md §6` (gate integrity — a check must fail closed, never pass falsely); ADR-0019 (the arch gate), ADR-0020 (migrations-applied gate); the shared scan harness `scripts/ci/_guard.mjs`; the meta-guard `scripts/ci/check-ci-guard-integrity.mjs`; the enforcing guard `scripts/ci/check-guard-has-test.mjs` + its `guard-test-allowlist.json`.

## Context

The repo's architecture is protected by ~37 CI guards under `scripts/ci/` — the arch gate, the meta-guard, the auth/JWT/OAuth security guards, the email/migration/identity guards. They are the tripwires that keep the four architecture questions honest at CI time.

But a guard is only as trustworthy as its own detection logic, and that logic was **largely unproven**. A guard is a regex- or AST-driven scanner; a one-character change to a pattern, an inverted condition, or a `runScanGuard` misconfiguration can make it silently stop catching the very thing it exists to catch — and because the guard still exits 0, **nothing notices**. This is the exact false-green failure mode `decisions.md §6` was written to prevent, one level up: the guard passes, so the gate passes, so a real violation (an unsigned-JWT auth bypass, a UI→DB leak, a swallowed auth error) ships. During this work we found this was not hypothetical: `check-guard-has-test` itself, before it had a test, shipped with a coverage heuristic that counted comment mentions as coverage (a false positive judge-arch caught), and would have counted "6 guards tested" when only 3 were.

Guards that fail closed and emit evidence (§6) are necessary but **not sufficient**: they prove the guard _ran_, not that its detection is _correct_. Only a test that feeds the guard a known violation and asserts it fails proves correctness.

## Decision

1. **Every guard in `scripts/ci/` must be pinned by a committed test** that actually runs it. A guard `check-foo.mjs` counts as tested only when a committed `*.test.ts` passes the guard's path to a subprocess exec (directly or via a resolved `const` binding) — a comment or an unrelated mention does not count.
2. **Enforce it mechanically** with `scripts/ci/check-guard-has-test.mjs` — a blocking guard (in the `lint-arch-critical` gate) that parses each test with the **TypeScript compiler API** (not string matching) to determine which guards are actually exercised. It fails when a serving guard is untested-and-not-allowlisted, and when a guard gains a test but is still on the allowlist (the ratchet must shrink). It fails closed (missing dir / missing test tree / malformed allowlist / zero guards → non-zero) and is itself pinned by its own smoke test.
3. **Ratchet, don't big-bang.** Guards that predated this rule sit on a **shrink-only** allowlist, `scripts/ci/guard-test-allowlist.json`. A new guard may never be added to it; a guard that gains a test must be removed. We burn the list down to **zero** with one smoke test per guard: run the _real_ guard against throwaway repo-shaped fixtures and assert its exit codes (clean → 0, each distinct violation → 1, escape hatch → 0, fail-closed → 2). Security guards additionally reproduce the real bypass they defend against (`owasp-secure-coding-bdd`).
4. **The test is part of "done."** A new guard is not complete until its smoke test lands in the same PR — the same discipline ADR-0019/0020 apply to the gate itself.

## Considered options

- **(chosen) A blocking "guards must be tested" gate + shrink-only burn-down.** Makes the invariant mechanical and self-enforcing, tolerates the pre-existing untested set without blocking all work, and guarantees monotonic progress to full coverage.
- **Rely on code review to remember.** Rejected — the same "willpower, not a forcing function" failure that let the original test-less guard ship; review misses it exactly when under deadline pressure.
- **Extend the existing bdd-gate (D-13).** Rejected — bdd-gate covers `src/services`, `src/pages`, `supabase/functions`, not `scripts/ci`, and its grep-based coverage is looser than "a test that actually execs the guard."
- **Test-less guards, accept the risk.** Rejected — the found false positive proves a guard's own logic silently rots; the whole gate's credibility rests on the guards being correct.

## Consequences

- **Positive:** no guard can rot to a false green undetected; the meta-guard and `arch-gate` themselves are now proven; the ratchet only shrinks, so coverage is monotonic; each guard's fixtures double as living documentation of exactly what it catches.
- **Negative / trade-offs:** one smoke test per guard (~37 tests) — real, one-time effort, tracked as debt on the allowlist. `fileURLToPath`-rooted and env/DB-gated guards need a copy-to-fixture or an explicit test-root seam (e.g. `GUARD_HAS_TEST_ROOT`) to be steerable; that seam is a small, documented, test-only widening of otherwise-fixed roots (never set in CI/production). `check-guard-has-test` depends on `typescript` (a devDependency, present in the guards' CI job) — if the CI install is ever switched to production-only, the gate breaks _closed_, never silent-green.

## Confirmation

`scripts/ci/check-guard-has-test.mjs` (green in `lint-arch-critical`) is the fitness function; its own `src/test/smoke/check-guard-has-test.smoke.test.ts` (15 scenarios) proves the enforcer, and the per-guard smoke tests under `src/test/smoke/` prove the guards. The allowlist count in `guard-test-allowlist.json` is the burn-down metric; the decision is fully realized when it reaches `[]`.
