# Mutation climb batch 2: file-upload / rate-limit / CRS / privacy, ratchet break 44 → 47

- Status: accepted
- Date: 2026-10-15
- Deciders: engineering (CI-refactor, mutation-gate climb)

## Context

Second climb step on security.ts's mutation survivors, following
`20261015-mutation-climb-batch1-break-44.md` (score 47.88%, floor 44). The next densest high-value
clusters were L800–845 and L1001–1052: four security/compliance functions whose rejection branches
were largely un-exercised (many mutants were no-coverage, not just survived):

- `validateFileUpload` (extension / MIME / size / path-traversal checks),
- `isClientRateLimited` (sliding-window attempt limiter),
- `hasCRSAttackPattern` (oversize-payload guard),
- `isPrivacyDisclosureAllowed` (consent + retention-window + sensitive-category sharing).

## Decision

1. **Add branch-by-branch tests** (`src/test/lib/security-upload-ratelimit-privacy.test.ts`, 14
   cases) covering every branch and boundary of the four functions. Deterministic inputs only: fake
   timers (`vi.useFakeTimers` / `vi.setSystemTime`) for the time-based rate limiter, and an explicit
   `file.size` override instead of allocating a 10 MB buffer.
2. **Ratchet `thresholds.break` from 44 to 47.**

## Verification

The batch's kills were verified with a **line-range** Stryker run over exactly the two target clusters
(`--mutate "src/lib/security.ts:800-845" --mutate "src/lib/security.ts:1001-1052"`), which scores only
those lines and finishes in minutes rather than the hours a full-file run takes on the dev box:

```
security.ts | 100.00 | ... | 43 killed | 0 survived | 0 no-coverage
```

**100% on the targeted lines — all 43 mutants killed, zero survivors, zero equivalents.** Stryker's
mutation score counts detected mutants (killed + timed-out), so batch 1's 47.88% was 665 detected (658
killed + 7 timed-out) of 1389. Adding 43 kills raises it to ~708 / 1389 ≈ **51%**. `break` is set to
47, a ~4-point margin below the new score (consistent with the prior floors' ~3.9-point margin and
comfortably past the timeout wobble of 3–7 mutants). The **authoritative full-file score is CI's
Stryker run** on this PR (triggered because `stryker.conf.json` changed); `break` can be tightened from
the CI mutation-report artifact if there is more headroom.

## Consequences

- The mutation floor is now 47; it ratchets up with each batch and never regresses.
- The four functions are now fully branch-covered; ~680 undetected mutants remain file-wide (survived
  + no-coverage, heavily regex/string), continuing toward ~85% in later batches.
- **Tooling note:** the full-file Stryker run is impractically slow on the dev box (a full run was
  observed still at 2% after ~23 minutes). The climb now uses line-range `mutate` for local
  verification, and a separate mutation-gate performance change (incremental mode, higher concurrency,
  a longer dry-run timeout, and dropping the low-value Regex mutator) is planned to make the committed
  gate fast and reliable.
