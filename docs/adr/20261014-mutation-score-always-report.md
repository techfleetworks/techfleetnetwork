# Mutation gate: always-report so the score check can be a required status

- Status: accepted
- Date: 2026-10-14
- Deciders: engineering (CI-refactor wave 1, follow-up to the break-floor ADR)

## Context

`20261014-mutation-gate-break-floor.md` armed the mutation gate (break 40) and added the
`check-mutation-gate-armed` guard, which already blocks merges via the required `gate` aggregator. That
protects against *disarming* the gate, but the actual mutation **score** check (`stryker`) is not yet
merge-blocking: a PR can drop security.ts's score below 40 and still merge, because `stryker` is not in
the `main-security-gates` ruleset's required checks.

The obvious fix — add `stryker` to the ruleset — is a trap. The mutation workflow was path-filtered
(`pull_request.paths: [src/lib/security.ts, stryker.conf.json, mutation.yml]`), so it only posts a
`stryker` status on PRs that touch those paths. A **required** status check must report on *every* PR;
a path-filtered one leaves every unrelated PR stuck at "Expected — waiting for status" for a check that
never runs, which would block all merges repo-wide.

## Decision

Adopt the **always-report** pattern so `stryker` reports on every PR without running the slow campaign
every time, making it safe to require.

1. **Remove the top-level `paths:` filter.** The `stryker` job now triggers on every `pull_request` to
   main (plus the weekly schedule and manual dispatch), so the check always reports.
2. **Move the scope decision inside the job.** A first step diffs the PR against its merge-base and sets
   `run=true` only when the diff touches the mutated target (`src/lib/security.ts`) or the gate's own
   config/workflow; otherwise `run=false`. On schedule/dispatch (no base ref) it runs the full campaign.
3. **Gate the heavy steps on `run == 'true'`.** Node setup, `npm ci`, Stryker, and the report upload
   run only when in scope. Out of scope, the job does a few-second diff and reports success. In scope,
   it runs the full campaign and fails below `break`.

The in-scope path list MUST stay in sync with `mutate` in stryker.conf.json; expand both in lockstep
when the target grows (noted in the workflow).

## Consequences

- `stryker` can now be added to the `main-security-gates` ruleset as a required check without
  deadlocking unrelated PRs. Once added, a PR that drops the security.ts mutation score below 40 is
  blocked from merging. (Adding it to the ruleset is a separate one-time admin action, done after this
  merges.)
- Every PR now spins up the `stryker` job briefly (a cheap diff) even when out of scope. This is a few
  seconds of runner time and is the necessary cost of a required, path-aware check.
- The heavy mutation campaign still runs only when the mutated code or gate config changes, and weekly,
  so the 30-minute budget and cost profile are unchanged for the expensive path.
- The base_ref is passed via env, never interpolated into the shell, to avoid the script-injection
  class (same convention as the routing/parity workflows).
- **Limitation:** the scope filter keys on the mutated **file path** (`src/lib/security.ts`) plus the
  gate's own config/workflow — not on security.ts's dependency graph. A PR that changes a module
  security.ts imports (or a shared test helper) can affect the score without matching the filter, so the
  campaign is skipped on that PR. This blind spot is inherent to path-scoping (the previous top-level
  `paths:` filter had it too); the weekly scheduled full run is the backstop, and expanding `mutate`
  plus the in-scope list is how coverage grows.
