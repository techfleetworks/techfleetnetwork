# Mutation gate performance: incremental, concurrency, dry-run timeout (and keep the Regex mutator)

- Status: accepted
- Date: 2026-10-15
- Deciders: engineering (CI-refactor, mutation-gate climb tooling)

## Context

The security.ts mutation climb (batches 1–2) exposed that a full-file Stryker run is impractically
slow on the dev box: a run was observed still at 2% after ~23 minutes, and the initial dry run
repeatedly hit Stryker's default `dryRunTimeoutMinutes: 5` because booting the full ~2,000-file vitest
suite takes longer than 5 minutes there. This made local verification unreliable and pushed all
measurement onto CI.

## Decision

Apply the speed changes that do **not** change what the gate measures:

1. **`incremental: true`** — Stryker caches per-mutant results in `reports/stryker-incremental.json`
   (now gitignored) and only re-tests mutants in changed code on the next run. Big win for repeated
   local runs. Harmless on fresh CI runners (no cached file, so a full run as before).
2. **`concurrency: 4`** — up from 2, to use GitHub's 4-vCPU `ubuntu-latest` runner. (Local runs use
   line-range `mutate`, so local concurrency matters little.)
3. **`dryRunTimeoutMinutes: 15`** — raise the dry-run ceiling so the slow suite boot can complete
   instead of aborting at the 5-minute default.

**Local practice (not committed config):** verify a batch with a line-range mutate, e.g.
`npx stryker run --mutate "src/lib/security.ts:800-845"`, which scores only the targeted lines and
finishes in minutes instead of the hours a full-file run takes on the dev box.

## Explicitly NOT done: dropping the Regex mutator

An earlier plan proposed `excludedMutations: ["Regex"]` to cut ~300 of the 1,389 mutants. **Batch 1
evidence overrode that:** two regex mutants on security.ts were real security bugs (subresource-integrity
anchor bypasses — an unanchored SRI regex would accept `junk-sha256-…` or `sha256-…trailing-junk`). The
mutation gate is what surfaced them. Most regex mutants are low-value or equivalent, but the small share
that are real can be security-critical, and dropping the mutator removes that safety net for current and
future regexes in security.ts. The coverage is worth more than the ~22% mutant reduction, especially now
that line-range + concurrency already address the speed problem. The Regex mutator stays.

## Consequences

- The gate measures exactly the same mutants as before (no score change, `break` stays 47). These are
  pure performance and reliability changes.
- Local full-file runs become feasible via incremental caching after a first run; local batch
  verification uses line-range mutate.
- CI runs faster on 4 vCPUs and no longer risks the 5-minute dry-run abort.
- Future option (not taken here): cache `reports/stryker-incremental.json` across CI runs for
  incremental CI, deferred because a stale incremental cache is a correctness risk that needs its own
  key-invalidation design.
