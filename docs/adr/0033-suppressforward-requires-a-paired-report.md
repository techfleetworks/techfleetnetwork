# ADR 0033 — `suppressForward` requires a paired report (the opt-out can't become a silent drop)

- Status: Accepted
- Date: 2026-08-30
- Deciders: TechFleet (owner)
- Related: ADR-0021 (logger→reporter bridge + the ramp); ADR-0031 (a classified drop is never a black hole); `decisions.md §4`; introduced alongside the logger both-path reconciliation (PR #327); `src/services/logger.service.ts`, `src/lib/service-result.ts`; guard `scripts/ci/check-suppressforward-has-report.mjs`.

## Context

The logger both-path reconciliation (#327) added a `suppressForward` flag: `logger.error(..., { suppressForward: true })` tells the ADR-0021 bridge NOT to forward that error to the reporter, because the caller already reports it another way (so the flag prevents a _double_ audit row once `logger_error_reporting` ramps).

But `suppressForward` is a **two-edged lever**. Used correctly (paired with a `report`/`reportError`/`handleServiceError` for the same error) it removes a duplicate. Used incorrectly — set on a log with **no** paired report — it does the opposite of its intent: once the flag ramps, that error is dropped with **zero** audit signal. That is exactly the silent-drop bug ADR-0021 and ADR-0031 exist to kill. The four current uses are all correct, but nothing stops a future catch from writing `suppressForward: true` alone. `judge-arch` flagged this on #327 as a footgun with no mechanical guard, inconsistent with this repo's convention of _mechanizing_ anti-silent-drop invariants.

## Decision

Add a blocking guard **`scripts/ci/check-suppressforward-has-report.mjs`** (in `lint-arch-critical`): every `suppressForward: true` object property must have a call to `report` / `reportError` / `reportValidationRejection` / `handleServiceError` **in its enclosing function**. It parses each `src` file with the TypeScript compiler API (via the shared `_guard.mjs` scan harness), walks up from each `suppressForward: true` to the containing function, and fails (exit 1) if that function has no reporter call. Fails **closed** (missing/zero-scan → non-zero) and prints an evidence line. Tests exclude themselves; `logger.service.ts` (which _defines_ the flag) is excluded as not-a-caller.

So the lever is safe by construction: you may silence the bridge's forward **only** where the error is genuinely reported elsewhere — otherwise CI is red.

## Considered options

- **(chosen) A CI guard requiring a paired report in the same function.** Mechanizes the invariant (matches ADR-0031 / no-dropped-supabase-error), catches the footgun for every future developer, low false-positive (same-function scope is the honest proxy for "reported on this path").
- **Rely on code review + the ADR-0021 pre-ramp human checklist.** Rejected — this repo's whole thesis is that review-only invariants rot; the flag ships now and outlives the reconciliation.
- **Data-flow-precise "reported on every path" analysis.** Rejected — far more false-positive-prone; same-function presence of a reporter is a sound, simple over-approximation (it can only be too lenient in pathological branching, never too strict on the common shape).

## Consequences

- **Positive:** `suppressForward` can never silently drop an error — the one real footgun of the #327 reconciliation is now structurally closed; safe for the `logger_error_reporting` ramp and for every future caller.
- **Negative / honest scope:**
  - **Same-function proxy, and it is deliberately lenient in three ways** (all of which only ever make the guard _more_ permissive — never a false positive): (1) it checks the reporter is _somewhere in the enclosing function_, not that it fires on the same branch/path; (2) the reporter match is _receiver-agnostic_ and ignores arguments — any `x.report(...)`/`reportError(...)` in the function counts; (3) at module scope the "enclosing function" degrades to the whole file, so a top-level `suppressForward: true` is satisfied by any reporter anywhere in that file. This is the accepted over-approximation: it catches the real footgun (suppress with **no** report at all) and matches how the legitimate sites are written; tightening to per-path/receiver-exact isn't worth the false positives.
  - Does **not** address the separate `log.track` double-_forward_ class (a `log.error; throw` inside a `log.track` block forwards twice once ramped) — that over-reports (not a silent drop) and is tracked separately for the ramp.

## Confirmation

`src/test/smoke/check-suppressforward-has-report.smoke.test.ts` proves it (paired → 0; unpaired → 1; report-in-other-function → 1; no-suppressForward → 0; real repo → 0; fail-closed on missing root → 2) and it discriminates under the mutation gate. `check-guards-wired` / `check-guard-has-test` / `check-ci-guard-integrity` cover the new guard; it runs the real repo clean (689 files, 0 violations).
