# CI refactor wave plan

Companion to [ci-actions-skills-audit-2026-10.md](./ci-actions-skills-audit-2026-10.md). The audit
graded every CI action against the enterprise skills and ended with a prioritized fix list. This plan
turns that list into merge-sized PRs, grouped into three waves by priority.

Each wave follows the same build rule the audit calls for, so the refactor dogfoods the skills it
installs. Every PR carries:

- an **ADR** recording why the gate changed (the `architectural-decision-records` skill),
- a **discrimination test** that fails when the new gate is neutralized (`verifiable-quality-gates`),
- a **judge-arch** fresh-context review before the PR opens,
- a **skill-application receipt** covering every skill (applied or not-applicable).

Where a ready-made enterprise-skills checker fits, we copy it and wire it in rather than hand-write a new
one. Where TFN's stack (Supabase edge functions, local Supabase in Docker, the bespoke eslint plugins)
needs a native check, we build it against the local Supabase harness the e2e job already uses.

The North Star is the audit's through-line: **the guard layer is already proven; the application is
not.** Every wave converts a gate that looks like enforcement but cannot fail into one with a floor it
can trip, measured against the PR rather than production.

---

## Wave 1 - the two HIGH fixes

The two places where a green check is currently misleading at the highest cost: test-efficacy and
accessibility. Both are HIGH because they report "passing" while measuring nothing that can fail on a
bad PR.

### PR 1.1 - Make the product mutation gate real

**Problem (observed).** `stryker.conf.json` sets `"mutate": ["src/lib/security.ts"]` (a single file) and
`"thresholds": { "high": 80, "low": 60, "break": 0 }`. With `break: 0` the mutation score can never fall
low enough to fail the job, and the scope is one file out of the whole `src/` tree. The gate is green by
construction.

**Fix.**
- Set `break` to a real floor, pinned at or just below the current measured score on the in-scope
  files so it ratchets and never shrinks (the same shrink-only discipline the coverage floor already
  uses).
- Expand `mutate` from the single file to the business-logic surfaces that carry decisions: the
  calculation/validation modules under `src/lib`, `src/services`, and the projection/ledger code. Keep
  pure-view and generated files out of scope so the score stays meaningful.
- Run Stryker **incrementally against the PR diff** (`--incremental`, changed-file scope) so the gate
  measures the change, not a nightly full run. Fail closed when the diff touches an in-scope file and the
  score drops below `break`.
- Ratchet the coverage floor in the same PR (`scripts/ci/coverage-floor.json` is currently lines 25 /
  statements 24 / functions 20 / branches 17). Raise each to the current measured value so it can only go
  up.

**Dogfood artifacts.**
- ADR: "Product mutation gate measures the change and can fail" (supersedes the implicit `break: 0`
  decision).
- Discrimination test: a harness mutant on an in-scope file that the test suite does not kill must drive
  the score below `break` and turn the job red; resetting `break` to 0 must turn it green. The test
  asserts both directions, proving the floor is load-bearing. This mirrors the enterprise-skills
  `verifiable-gates` test.
- Receipt cites `verifiable-quality-gates` and `comprehensive-test-strategy`.

**Copy-vs-build.** Build (TFN owns its StrykerJS config); the discrimination-test shape is copied from the
enterprise-skills `test/verifiable-gates.test.mjs` pattern.

### PR 1.2 - A real PR-scoped accessibility gate

**Problem (observed).** Three a11y signals all fail to test the PR:
- `lighthouse.yml` runs `lhci collect` against **production URLs**
  (`https://www.techfleet.network/ ... /login /register /project-openings`) with the header comment
  "Lighthouse against the production URL." A broken PR passes because prod is still the old build.
- `eslint.config.js` maps every `jsx-a11y` rule to `"warn"` (the "Baseline strategy: every project-wide
  rule starts at warn") with no `--max-warnings`, so none of them block.
- The axe route scan is parked.

**Fix.**
- Stand up a **PR-scoped** a11y job: build the PR, serve it against **local Supabase in Docker** (the
  harness the Playwright e2e job already provisions), and run axe-core against the key routes. Assert
  zero serious/critical violations on the PR build. This is the audit's "rebuild against local Supabase"
  decision.
- Promote the high-signal `jsx-a11y` rules (the ones that map to WCAG A/AA failures, not stylistic
  warnings) from `"warn"` to `"error"`, and add `--max-warnings 0` on that curated set so a regression
  blocks. Leave the long tail at warn to avoid a wall of noise.
- Leave `lighthouse.yml` as a production **observability** signal (renamed/relabeled so no one reads it as
  a PR gate), since measuring prod is a legitimate monitor, just not a merge gate.

**Dogfood artifacts.**
- ADR: "Accessibility is gated on the PR build, not production."
- Discrimination test: inject a known a11y violation (for example a control with no accessible name, or a
  contrast failure) into the PR build fixture; the axe job must go red and the promoted eslint rule must
  flag it. Removing the violation returns green. Proves the gate detects.
- Receipt cites `universal-accessibility-wcag`, `verifiable-quality-gates`, and
  `universal-browser-device-support` (shared local-Supabase harness).

**Copy-vs-build.** Copy the enterprise-skills `axe-results` / `a11y-checklist` gate scripts where they
fit the axe output shape; build the local-Supabase serve-and-scan wiring (TFN-native).

---

## Wave 2 - fill the ungated domains (MED)

Domains the skills require but TFN does not gate on the PR at all.

### PR 2.1 - Untagged-PII and retention gate
Copy the enterprise-skills `untagged-pii` and `retention-basis` checkers. New columns that look like PII
(email, name, discord id, IP) must carry a classification tag and a retention basis, or the gate fails.
Discrimination test: an untagged PII-shaped column turns the job red. Cites `compliance-data-lifecycle`.

### PR 2.2 - no-UA-sniffing now; cross-browser revived later
Copy the enterprise-skills `no-ua-sniffing` lint as the cheap always-on guard (blocks `navigator.userAgent`
branching). Schedule the parked `cross-browser.yml` / `browserstack-weekly.yml` revival against local
Supabase as a follow-up once Wave 1's local-Supabase harness is proven. Cites
`universal-browser-device-support`.

### PR 2.3 - ADR routing rule
Copy the enterprise-skills `change-routing` gate: a change that touches a routed surface (new edge
function, new migration, new gate) must ship the matching artifact (ADR, test). Discrimination test: a
routed change with the artifact removed fails. Cites `architectural-decision-records` and `arch-encode`.

---

## Wave 3 - stop the misleading greens (MED)

Gates that run but assert too little, plus the required-check set.

### PR 3.1 - Relabel or upgrade the BDD grep
`bdd-gate.yml` currently does a shallow `grep -rl` for the module name in test files with a basename
fallback. Either upgrade it to parse Gherkin and assert a real scenario + step binding (copy the
enterprise-skills `bdd-gates` engine, which already uses `@cucumber/gherkin`), or relabel it honestly as a
"test-file-exists" heuristic so no one mistakes it for behavioral coverage. Recommend upgrade. Cites
`bdd-comprehensive-testing`.

### PR 3.2 - Make self-skipping workflows skip visibly
Workflows that silently no-op when a secret or precondition is absent should emit a visible skipped state,
not a green check. Copy the enterprise-skills `alert-hygiene` discipline. Cites `sre-operational-readiness`.

### PR 3.3 - Confirm and commit CodeQL
`security.yml` references CodeQL but `codeql.yml` is absent from `.github/workflows/`. Either add the
workflow or remove the dangling reference. Cites `owasp-secure-coding-bdd`.

### PR 3.4 - Commit and guard the required-check set
The branch-protection required-check set is not committed to the repo, so there is no reviewable record of
which checks block merge. Commit it as config and add a guard that fails if the set drifts from the
committed list (the enterprise-skills `required-checks` gate). This is the capstone: it makes every gate
above actually merge-blocking and keeps them that way. Cites `verifiable-quality-gates` and
`release-deployment-safety`. **Merge this wave last** so the required-set reflects the final gate list.

---

## Sequencing notes

- **Wave 1 first and in order:** PR 1.1 and PR 1.2 are independent and can run in parallel, but PR 1.2's
  local-Supabase serve-and-scan harness is reused by Wave 2's cross-browser revival, so land 1.2 before
  scheduling that follow-up.
- **The required-check guard (PR 3.4) merges last** across the whole program, so it pins the complete,
  final set rather than a moving target.
- Each PR is independently revertable. None changes application code; they change CI config, eslint
  severity, and gate scripts, plus the fixtures each discrimination test needs.
