# Mutation climb batch 1: kill security.ts survivors, ratchet break 40 → 44

- Status: accepted
- Date: 2026-10-15
- Deciders: engineering (CI-refactor, mutation-gate climb)

## Context

`20261014-mutation-gate-break-floor.md` armed the mutation gate at `break: 40` against a measured
security.ts mutation score of 43.84%, and noted the 623 survivors would be killed in locked steps,
ratcheting the floor upward. This is the first climb step.

The survivor report from the armed-gate run showed the highest-density high-value cluster at lines
300–399 of src/lib/security.ts: three security-critical functions that had only happy-path coverage —
`isTrustedThirdPartyScriptUrl` (third-party script allowlist + SRI), `isPaymentWebhookReplaySafe`
(payment webhook replay window), and `isHighRiskTransactionAuthorized` (actor/nonce/MFA binding).

## Decision

1. **Add branch-by-branch tests** for the three functions
   (`src/test/lib/security-third-party-payment-txn.test.ts`), exercising every branch and boundary so a
   mutation (`>=` vs `>`, `&&` vs `||`, `===` vs `!==`, a dropped guard, a shifted default) changes an
   asserted outcome. Deterministic inputs only (explicit `nowMs`, no `Date.now`).
2. **Ratchet `thresholds.break` from 40 to 44.** The measured score rose from 43.84% to **47.88%**
   (killed 606 → 658; survived 623 → 583; no-coverage 157 → 141). 44 sits just under the new score with
   the same ~4-point timeout-wobble margin as the prior floor, and may only rise, never fall.

## Verification and the skeptical pass

The kills were verified by re-running Stryker (not by assuming a passing test kills a mutant). An
adversarial review of the result found four residual mutants in the three functions and handled each
honestly:

- **1 equivalent mutant** (L313, `typeof integrity === "string"` → `true`): given the `string |
  undefined` type, `true && regex.test(x)` behaves identically to the guarded form for every possible
  input (the regex coerces a non-string anyway). It is provably unkillable and is left as a documented
  equivalent, not chased. It is counted in the 47.88%.
- **2 SRI-regex anchor mutants** (L313, dropped `^` / `$`): these are killable *and* a real
  subresource-integrity bypass (an unanchored SRI pattern would accept `junk-sha256-…` or
  `sha256-…trailing-junk`). Closed with leading/trailing-junk integrity tests.
- **1 default-tolerance arithmetic mutant** (L330, `5 * 60 * 1000` → `5 / 60`): the boundary tests
  passed `toleranceMs` explicitly and never exercised the default param. Closed with a default-tolerance
  test.

## Consequences

- The mutation floor is now 44; a change that drops security.ts's score below it fails the required
  `stryker` check. The floor ratchets up with each climb batch and never regresses.
- This batch does not make security.ts fully tested: ~583 survivors remain (heavily regex/string, plus
  no-coverage), and further batches continue the climb toward ~85%. The remaining targets are tracked in
  the survivor report.
- Pattern for future batches: pick a cohesive high-value cluster, write branch-complete tests, verify
  kills with Stryker, document genuine equivalents, ratchet `break` to just under the new measured score.
