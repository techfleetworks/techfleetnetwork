# ADR 0029 — Every guard must be wired into CI (no unwired guards)

- Status: Accepted
- Date: 2026-08-28
- Deciders: TechFleet (owner)
- Related: ADR-0022 (every guard tested), ADR-0023 (guard tests discriminate), ADR-0024 (which _named_ this gap), ADR-0028 (the guard whose enforcement this protects); `scripts/ci/check-guards-wired.mjs`; `decisions.md §6`; `AGENTS.md`.

## Context

The project already makes a guard hard to get wrong in three ways: it must have a committed test (ADR-0022), that test must be non-vacuous (ADR-0023, the discrimination gate), and it must fail closed (`decisions.md §6`, the meta-guard). But all of those assume the guard **runs**. A guard committed to `scripts/ci/` but referenced by **no** workflow verifies nothing — it looks like protection while enforcing none. ADR-0024 hit exactly this (`check-no-opaque-script-error` ran in no workflow) and named "an unwired guard" as a gap it could only _observe_, not prevent.

This surfaced again the moment it was looked for: enumerating the guards against the workflows found `check-progress-identity-sql-smoke` referenced by no workflow at all — a live instance of the same class.

A guarantee like ADR-0028's ("no consumer may couple to the raw error shape") is only as real as the guard behind it _actually running on every PR_. So "the guard is wired" must itself be mechanical, not trusted.

## Decision

Add a blocking meta-check, `scripts/ci/check-guards-wired.mjs`, that fails if any `scripts/ci/check-*.mjs` is referenced by **no** `.github/workflows/*.yml` job. A guard deliberately deferred is recorded in a **shrink-only** allowlist (`guards-wired-allowlist.json`); the list may only shrink. It is wired into the required `gate` (via `gate-verify`), so:

- a new guard that isn't wired → red → can't merge;
- a guard silently deleted from the workflow (or the file) → red (or, if wired into a required job, the job errors) → can't merge;
- combined with ADR-0022/0023 and the meta-guard, a guard cannot be added untested, be vacuous, fail open, **or run nowhere**.

All previously-unwired guards were resolved as part of this change (`check-progress-identity-sql-smoke` wired into informational `lint-arch`; the new `check-no-raw-functions-error-shape` and this meta-check wired into the blocking gate).

## Considered options

- **(chosen) A blocking meta-check that every guard is referenced by a workflow, + a shrink-only allowlist.** Mechanizes the ADR-0024 gap; cheap; consistent with the existing guard-the-guard ratchets.
- **Rely on review to notice unwired guards.** Rejected — it already failed twice (ADR-0024, and `check-progress-identity-sql-smoke`); "someone will notice" is not a structure.
- **Require every guard to be _blocking_ (in the required gate), not merely wired.** Rejected as too strong now — some guards are intentionally informational during rollout (the plan's observe-then-block ratchet). This ADR guarantees a guard _runs_; whether it _blocks_ stays a per-guard decision encoded in the `gate` aggregator's `needs`.

## Consequences

- **Positive:** "a guard that protects nothing because it runs nowhere" is now impossible by construction; the ADR-0024 residual is closed for every current and future guard; a deleted-from-CI guard reddens instead of silently disappearing.
- **Negative / trade-offs:** the meta-check keys on the guard's **filename** appearing in workflow YAML. It strips `#` comments first and matches the name as an anchored token (preceded by `/`, quote, or whitespace; not a prefix of a longer name), so a commented-out step or a substring collision (`check-auth.mjs` vs `recheck-auth.mjs`) does **not** count as wired. What it proves is _referenced in a live step_, not _runs in a triggered, required job_ — a guard wired only into an `on:`-gated or informational workflow is "wired" here but may not block (that blocking decision lives in the `gate` aggregator's `needs`; a guard invoked only indirectly would need a direct reference or an allowlist entry). It is a meta-check, so — like `check-guard-has-test` — it reads directories without the scan harness and is a reviewed entry in the meta-guard's `BESPOKE_DIR_READERS`. The allowlist can hide an intentionally-deferred guard, but only visibly and shrink-only. The ultimate root of trust remains branch protection requiring the `gate` job — a repo setting, not code.

## Confirmation

`src/test/smoke/check-guards-wired.smoke.test.ts` proves it (passes a wired guard, FLAGS an unwired one, honors the allowlist, fails closed with no workflows dir) and discriminates under the mutation gate. It runs green on the real repo (all guards wired) and is a required step in `gate-verify`.
