# Re-audit 2026-10-30: Testing and quality gates

**Dimension:** comprehensive-test-strategy, bdd-comprehensive-testing, verifiable-quality-gates.
**Tree:** `C:\Users\morga\Documents\tfn-reaudit` at `e4c366190` (2026-10-17). This matches remote `main` (checked with `gh api repos/techfleetworks/techfleetnetwork/commits/main` on 2026-10-30).
**Method:** read-only. I read the workflows, guards, configs, and tests. I ran the plain-node guards locally. I queried GitHub (rulesets, run history, job logs) with `gh`. I did not run vitest, tsc, deno, Playwright, or Stryker on this machine because there is no `node_modules`. Where I give real coverage or mutation numbers, they come from CI job logs.
**Baseline:** 2026-10-09 audit gave test strategy 43 and quality gates 64. BDD was not scored on its own before.

Evidence states follow `skeptical-audit/references/evidence-discipline.md`: proven, observed, inferred, documented, reported, not-assessed.

---

## Scores

| Sub-score | Prior | Now | Delta | Band |
|---|---:|---:|---:|---|
| Comprehensive test strategy | 43 | **44** | +1 | weak (40-59) |
| BDD comprehensive testing | n/a | **18** | new | failing (<40) |
| Verifiable quality gates | 64 | **73** | +9 | adequate, material risk (60-74) |

### Why the test strategy score barely moved (+1)
Real gains since 10-09:
- A coverage gate now exists and is enforced.
- Product-code mutation testing now exists and is required.
- Lighthouse can now fail.

But this audit found a problem the prior audit missed. The browser-level test layer has been effectively dead since mid-August:
- The Playwright `e2e` job in `ci.yml` was skipped in 59 of 60 recent CI runs. It has not run since about 2026-08-12 (observed).
- `cross-browser.yml`, `a11y-audit.yml`, and `visual-regression.yml` have been parked to manual-only since 2026-08-01. Per their own comments, they have "never passed" (documented).
- `browserstack-weekly.yml` ends in `|| true`.

The prior audit gave the pyramid 82 partly for its "14-profile cross-browser e2e matrix." That credit was never earned. Correcting it cancels most of the gains.

| # | Sub-criterion | Weight | Prior | Now | Why |
|---|---|---:|---:|---:|---|
| 1 | Pyramid balance and assertion quality | 0.20 | 82 | 55 | e2e is dead (TST-1). 31/75 Deno tests never run (TST-2). pgTAP does not block (TST-3). |
| 2 | Coverage gate | 0.20 | 15 | 50 | Real and fails closed. But the floor is low (25% lines), the ratchet is not enforced, and there is no changed-line coverage. |
| 3 | Mutation testing (product) | 0.15 | 35 | 55 | Required and armed, score 53.78%. Only one file is mutated. |
| 4 | Contract tests (client to edge) | 0.15 | 30 | 30 | Unchanged. No consumer-driven contracts. |
| 5 | Load/perf and chaos | 0.15 | 38 | 35 | Lighthouse is armed but measures production, is warn-only for performance, and is not required. No load tests. No fault injection. |
| 6 | Property-based and flaky-test management | 0.15 | 40 | 35 | No fast-check. Playwright `retries: 1`. 24 skip markers. `browserstack \|\| true`. |
| | **Weighted** | | **43** | **44.25 → 44** | |

### Why BDD scores 18
- There are 10 `.feature` files with 99 `Scenario` lines, mostly tagged `@security` (observed).
- No Gherkin runner exists. There is no cucumber-js, playwright-bdd, or quickpickle in `package.json`.
- No feature file is executed. They are linked to hand-written tests only through code comments.
- There is no feature-file index and no enumeration of audiences.
- The only "BDD gate" is `bdd-gate.yml`. It is a path-filtered grep and is not a required check.

Credit (the 18 points) is for the real, well-formed `@security` scenarios that exist, and for the habit of cross-referencing them from tests.

### Why quality gates rose (+9)
These prior findings are fixed:
- **C1, type-check vacuous:** fixed. `npm run typecheck` runs `scripts/ci/typecheck.mjs` (`ci.yml:232-233`).
- **H1, no coverage gate:** fixed (`ci.yml:265-310`).
- **H2, no application mutation testing:** fixed (`mutation.yml`, required as `stryker`).
- **M1, permanent waivers:** fixed. All 305 waivers now have an expiry.
- The guard-discrimination system still holds (allowlist `[]`, 55 guards all wired).

Remaining material risk:
- A non-required gate whose structure means it silently never runs (e2e).
- Ratchets that claim "shrink-only" but are not enforced: the coverage floor and the mutation break floor.
- Two required gate scripts outside `scripts/ci/` that escape every meta-guard (`secret-scan.mjs`, `pentest/sast.mjs`).
- Nothing guards which jobs are members of the `gate` aggregator.
- Three parked workflows and one `|| true` workflow are normalized noise.

| # | Sub-criterion | Weight | Prior | Now |
|---|---|---:|---:|---:|
| 1 | Guard discrimination system | 25% | 96 | 92 |
| 2 | Fail-closed and no-vacuous meta-guards | 20% | 92 | 85 |
| 3 | Application coverage gate | 20% | 15 | 60 |
| 4 | Application mutation testing | 10% | 35 | 60 |
| 5 | No false greens / no vacuous gates | 20% | 45 | 60 |
| 6 | Waiver hygiene | 5% | 55 | 65 |
| | **Weighted** | | 64 | **73.25 → 73** |

---

## Findings

Severity: Critical / High / Medium / Low. "Fix" is ordered: prevent by construction, then a fail-closed gate, then a discrimination test.

### Test strategy (TST)

| ID | Sev | Location | What | Why it matters | State | Re-runnable source | Limitation | Smallest fix |
|---|---|---|---|---|---|---|---|---|
| TST-1 | **Critical** | `.github/workflows/ci.yml:740-742` (e2e `needs: [detect-changes, setup, gate]`, no status function in `if:`) and `ci.yml:407-424` (gate needs conditional jobs) | The Playwright e2e job never runs. `gate` depends on `migration-smoke`, `db-schema-gate`, and `deno-check`, which are usually skipped. GitHub's implicit `success()` on `e2e` therefore treats the chain as not-successful and skips e2e. It only runs if a PR touches migrations, schema-gate inputs, and edge functions all at once. | No browser-level test (auth flows, offline survival, CSP, regression incidents: 46 e2e files) has exercised any change since about 2026-08-12. `e2e` is also not a required check, so nobody is alerted. | **observed** (outcome); mechanism **inferred** | `gh run list --workflow=ci.yml --limit 60` then per-run `gh run view <id> --json jobs`: e2e = skipped 58, cancelled 1, unknown 1 (10-10 to 10-30). Samples from 08-18..08-22 and 09-15..09-20: all skipped. Last success ~08-12 (run 31763200983). Run 38795025359 changed `src/components/welcome/*` and still skipped e2e. | Mechanism inferred from GitHub's documented transitive skip behavior plus the observed pattern. I did not test a patched workflow. The onset commit (likely #220, 2026-08-16, which added skippable jobs to gate `needs`) is inferred. | Change e2e to `if: ${{ !cancelled() && needs.gate.result == 'success' && needs.detect-changes.outputs.e2e == 'true' }}`. Or drop the `gate` dependency. Then bring e2e into the `gate` aggregator as skipped-as-pass-only-when-filter-false. Add a guard (`check-ci-job-reachable.mjs`) that fails when a job needing an `always()` aggregator lacks an explicit status function. Add a smoke test with a fixture workflow that reproduces the skip. Also add `package.json`/`package-lock.json` to the e2e path filter, because dependency bumps never run e2e (run 39055431104). |
| TST-2 | **High** | `ci.yml:927-961` (hand-listed `deno test` targets) | 31 of 75 committed Deno edge tests are never run by any workflow. Examples: `_shared/internal-auth.test.ts`, `_shared/request-auth.test.ts`, `_shared/http.test.ts`, `auth-broker/index_test.ts`, `finalize-password-reset/index.test.ts`, `discord-oauth-callback/decide.test.ts`, `notify-applicant-status/index.test.ts`. | Tests for auth and security edge code can rot or go red unnoticed. The listed set also only runs when `supabase/functions/` changes. | **observed** | PowerShell: diff `git ls-files` matching `supabase/functions/.*[._]test\.ts$` against the paths listed in `ci.yml`, treating directory prefixes as covering. Result: 31/75 unlisted. Grep `deno test` across `.github/workflows`: only `ci.yml:927`. | I did not run the 31 tests, so I do not know whether they currently pass. | Replace the list with discovery: `deno test supabase/functions/` with a `--ignore` list that may only shrink. Or add `check-deno-tests-wired.mjs` (fail if any `*test.ts` is not in the run set; zero-found = exit 2) plus its smoke test. |
| TST-3 | **High** | `ci.yml:680-733` (`db-test`), comment at `ci.yml:681-685` | The 40 pgTAP suites (RLS, IDOR, erasure-cascade, ledger) run only on migration PRs and are **informational**. They are not in the `gate` needs. | The DB layer owns the security invariants, and its proofs do not block merge. The comment says it should be promoted "once a full green baseline is established". It was observed green on PR #432 (run 38491866795). | **observed** | Read `ci.yml:407-424` (no `db-test`). `gh run view 38491866795 --json jobs` shows db-test=success. | Only one green run was sampled. | Add `db-test` to `gate` needs with skipped-as-pass, like `migration-smoke`. Extend the trigger to `supabase/tests/**`. |
| TST-4 | **High** | `.github/workflows/cross-browser.yml`, `a11y-audit.yml`, `visual-regression.yml` (each `on:` has only `workflow_dispatch`) | The cross-browser matrix (14 Playwright profiles), the WCAG e2e audit, and pixel-diff visual regression have been parked since 2026-08-01. Their comments say they have "never passed (0 green)" because `TF_ADMIN_*` secrets were not migrated. | There is no automated cross-browser, a11y-in-browser, or visual check on any change for 3 months. The prior audit credited this matrix. | **documented** (comments) plus **observed** (latest runs of each are dated 2026-08-01/02; cross-browser is 40/40 failure) | `gh run list --workflow=cross-browser.yml --limit 40`; read the `on:` blocks. | I did not verify whether the secrets now exist. | Seed a CI test admin in the local-Supabase fixture (`scripts/ci/seed-e2e-fixtures.mjs`) instead of using prod `TF_ADMIN_*` secrets, so the workflows run against local Docker like `e2e`. Restore the triggers. Add a guard that fails when a test workflow has only `workflow_dispatch` without a dated waiver. |
| TST-5 | Medium | `.github/workflows/lighthouse.yml:23-39` | Lighthouse is armed (no `\|\| true`, accessibility is `error:0.9`). But it runs against **production** URLs, not the PR build. Performance is `warn`. It is **not** a required check. | A PR that regresses performance or a11y cannot fail it, because production is unchanged. A production regression would red every unrelated PR. | **observed** | Read the file. Ruleset required checks (below) do not include it. `node scripts/ci/check-lighthouse-gate-armed.mjs` gives exit 0. | none | Build the PR with `vite preview` and point `lhci` at localhost. Make performance `error` with a budget. Require the check. |
| TST-6 | Medium | `scripts/ci/coverage-floor.json`; `check-coverage-floor.mjs:14` | The floor (25/24/20/17) is about 2 points under measured coverage (27.04 lines / 25.61 statements / 21.35 functions / 19.20 branches on 10-17). It has not been raised since 10-10. Nothing enforces "may only RISE": the floor JSON can be lowered in any PR. There is no changed-line coverage. | New untested code can merge as long as total coverage stays about 25%. That is a weak floor for a production app. | **observed** | `git log -- scripts/ci/coverage-floor.json` (1 commit). Grep `coverage-floor.json` in `scripts/ci`: no shrink-guard. Coverage numbers from the CI log of job `coverage` in run 39055431104. | none | Add a floor-only-rises guard that diffs against `origin/main`, like `check-raw-invoke-budget-shrinks.mjs`, plus a smoke test. Add diff coverage (for example 70% on changed lines) in the coverage job. |
| TST-7 | Medium | `stryker.conf.json:5`; `mutation.yml:63` | Mutation testing covers one file (`src/lib/security.ts`). The score is 53.78% (744 killed / 528 survived / 114 no coverage). The heavy run happens only on PRs touching that file, plus a weekly schedule. Other business logic (auth classifier, retry/timeout, validators, services) is not mutated. | Most product tests are unproven against regressions. | **observed** | Log of the 2026-10-26 scheduled run: "Final mutation score of 53.78 is greater than or equal to break threshold 50". | none | Add targets in batches, each with its own break floor. Also see QG-3. |
| TST-8 | Medium | n/a (absence) | There are no consumer-driven contract tests (Pact or schema-shared) between `invokeEdge` callers and 125 edge functions. `*.contract.test.ts` files are internal logic contracts. `edge-cors-x-trace-contract.test.ts` pins CORS headers only. | A provider renaming a response field or changing a status code reddens nothing, especially now that e2e is dead (TST-1). | **observed** | `git ls-files` filtered for `contract.*test`; `package.json` has no pact. | I did not review each of the 17 contract-named files in full. | Share a zod response schema per function in `_shared/contracts/`. The client parses with it and Deno tests assert the handler output against it. Add a guard that every `invokeEdge(name)` has a schema. |
| TST-9 | Medium | n/a (absence) | No load, stress, or soak tests (k6/Artillery). No fault-injection chaos. No property-based tests (no fast-check). | Unchanged from prior. | **observed** | `git ls-files` filtered for `k6\|artillery\|locust\|chaos\|toxiproxy\|property`: 0 results. `package.json` has no fast-check. | none | Add k6 smoke against local Supabase for the top RPCs. Add fast-check for parsers (`normalize-query`, `ua-parse`, `opening-category`). |
| TST-10 | Low | `playwright.config.ts:146`; 24 skip markers in 15 test files; `browserstack-weekly.yml:76` | Flaky-test handling is only `retries: 1`. There is no quarantine list and no flaky-rate tracking. BrowserStack's run ends in `\|\| true`. | Retries hide intermittent failures. A vacuous weekly run signals false health. | **observed** | Select-String for `.skip(` / `.fixme(` / `.todo(`. Read the files. | Some skips may be conditional (`test.skip(cond)`). I did not classify them. | Replace `\|\| true` with a quarantine tag (`@quarantine` plus an expiry) and a report step. Track retried-then-passed tests from the Playwright JSON. |

### BDD (BDD)

| ID | Sev | Location | What | Why it matters | State | Re-runnable source | Limitation | Smallest fix |
|---|---|---|---|---|---|---|---|---|
| BDD-1 | **High** | `package.json` (no runner); 10 `*.feature` files (for example `src/features/auth/auth-redirect.feature`, `supabase/functions/handoff-*/…feature`) | There is no executable Gherkin runner. The 99 scenarios are prose. No step definitions exist. Nothing parses or executes them in CI. | Scenarios can drift from behavior without any signal. The skill requires them to be "executable, blocking in CI". | **observed** | `Select-String package.json -Pattern 'cucumber\|playwright-bdd\|gherkin\|quickpickle'`: none. Grep `\.feature` in ts/mjs/yml: only comments (`security-redirect.test.ts:6`, `resend-webhook/logic.test.ts:4`) and `bdd-gate.yml`. | I did not check whether each scenario has a matching hand-written assertion. | Add a vitest-native Gherkin runner (for example quickpickle or `@amiceli/vitest-cucumber`) so the features execute inside the existing `gate-test` shards. Add `check-gherkin-valid` + `check-bdd-executed` (from the enterprise-skills repo) to the critical lane, each with a smoke test. |
| BDD-2 | **High** | repo-wide | There is no permanent feature-file index and no audience enumeration (member, teacher, admin, anonymous visitor, cron/system). Coverage is about 10 features for 125 edge functions plus all UI flows. There are almost no tagged non-happy-path categories beyond `@security`. | The skill's core deliverable (every use case, every audience, happy and non-happy paths, indexed) is absent. | **observed** | `git ls-files '*.feature'` gives 10. `git ls-files docs` filtered for `feature\|bdd\|gherkin\|use-case`: none relevant. | Audience list inferred from CLAUDE.md and the routes. Not confirmed with the owner. | Create a generated `docs/bdd/index.md` (from enterprise-skills `bdd-index-generate.mjs`). Require `@audience-*` and `@happy` / `@edge` / `@error` tags through `check-bdd-tags`. |
| BDD-3 | Medium | `.github/workflows/bdd-gate.yml:8-13, 49-96` | The "BDD gate" only checks that some test file *mentions* the changed module path, or its basename if at least 6 characters. It does not look at Gherkin at all. It is path-filtered, not a required check, and its inline bash has no discrimination test. | A test that imports a name and asserts nothing satisfies it. It can never prove behavior coverage. 8/8 recent runs were success. | **observed** | Read the file. `gh run list --workflow=bdd-gate.yml`. Ruleset required checks do not include it. | none | Replace it with the BDD-1 engine. Until then, move the logic into `scripts/ci/check-bdd-referenced.mjs` so it falls under has-test and discrimination. |

### Quality gates (QG)

| ID | Sev | Location | What | Why it matters | State | Re-runnable source | Limitation | Smallest fix |
|---|---|---|---|---|---|---|---|---|
| QG-1 | **High** | `ci.yml:740-742`, `ci.yml:407-424` | (Gate view of TST-1.) The quality-gate system has no rule against "a job that structurally never runs". Its meta-guards check that *guards* are wired (`check-guards-wired`), not that *jobs* are reachable or that the `gate` aggregator's `needs` list stays complete. Removing `coverage` from `needs` (and its check line) would pass every guard. | "Zero-scan = red" is applied to guard scripts but not to CI jobs. A silently skipped job is the same false-green class at the workflow layer. | **observed** (no such guard: grep `scripts/ci` for `gate-verify\|needs\.coverage\|aggregator` matches only an unrelated comment) | as stated | I did not write a mutant workflow to prove the gap end to end. | Add `check-gate-aggregator.mjs`: parse `ci.yml`; require that a pinned set of jobs is in `gate.needs` and each is checked in the script; require that a job needing `gate` has `!cancelled()`. Add a smoke test with mutated fixtures. |
| QG-2 | Medium | `scripts/ci/check-coverage-floor.mjs:14` vs no ratchet guard | The script's comment calls the floor a ratchet that "may only RISE", but nothing enforces it (see TST-6). | A documented claim with no mechanism. | **observed** | as TST-6 | none | as TST-6 |
| QG-3 | Medium | `scripts/ci/check-mutation-gate-armed.mjs:71` | The armed-guard only requires `thresholds.break > 0`. Lowering 50 → 1 passes. It also does not check that `mutation.yml:63`'s scope regex matches `stryker.conf.json` `mutate`, even though the file comment says the two "MUST stay in sync". A new target added only to `mutate` would skip the campaign on PRs that touch it. | The ratchet can be quietly reversed, and the always-report skip can drift from the target. | **observed** (code read; `node scripts/ci/check-mutation-gate-armed.mjs` gives exit 0 "break=50 (> 0)") | as stated | none | Require break ≥ `origin/main`'s break (shrink-forbidden). Derive the scope regex from `mutate` (have the workflow read `stryker.conf.json` with `jq`) so it cannot drift. Add smoke cases for both. |
| QG-4 | Medium | `scripts/secret-scan.mjs:23-36,50`; `scripts/pentest/sast.mjs` | Two **required** gates (`secret-scan`, and the `security-owasp` step in `gate`) live outside `scripts/ci/check-*`. They therefore escape `check-guard-has-test`, `verify-guard-test-discrimination`, and `check-ci-guard-integrity`. `secret-scan.mjs` has no test at all. It skips unreadable files in a bare `catch { continue; }` and passes on 0 tracked files ("Scan passed across 0 tracked files"). | A neutered secret scan or SAST would stay green. | **observed** | Grep `secret-scan\.mjs` in `src`: none. `node scripts/secret-scan.mjs` gives "Scan passed across 3099 tracked files", exit 0. `node scripts/pentest/sast.mjs` gives "49 pass · 0 fail", exit 0. | `sast.mjs` rules are indirectly referenced by `check-owasp-coverage.smoke.test.ts` fixtures but not exec-tested. | Extend the meta-guards' discovery to every script a required job runs (derive it from the workflows), or move both into `scripts/ci/`. Add smoke tests: a planted `ghp_…` gives exit 1, zero files gives exit 2. |
| QG-5 | Medium | `ci.yml:534-560` (lint-arch, standard lane = 11 guards); `ci.yml:565-575` (audit-triggers); `bundle-size.yml:45` `continue-on-error: true` | 11 discrimination-tested guards, the audit-trigger check, and bundle size are informational. A red result does not block. | A tested guard that does not block only enforces when someone reads the log. | **observed** | `node scripts/ci/check-guards-wired.mjs`: "critical=29, standard=11, bespoke=15". Read the files. | I did not check how often standard-lane guards are red. | Promote standard-lane guards to critical one by one (each green on `main` in run 39055431104). Remove bundle-size `continue-on-error` now that a baseline exists. |
| QG-6 | Medium | `arch-gate.waivers.json` | All 305 waivers share one expiry, `2027-04-30` (a cliff). `node scripts/ci/arch-gate.mjs` reports **856** waived violations. The file has not shrunk since #427 (10-10). | A single-date expiry gives no gradual burn-down and will red every PR on one day. | **observed** | node one-liner over the file: `entries 305 noExpiry 0 {"2027-04-30":305}`. `node scripts/ci/arch-gate.mjs`: "PASS … (856 waived)". | Trend measured only from `git log` (3 commits). | Stagger expiries by cluster. Add a shrink-only count guard. |
| QG-7 | Low | `ci.yml:10,862-863` | The header comments say `deno-check` is "INFORMATIONAL … not in the gate aggregator". It is in `gate.needs` (`ci.yml:422`). | Misleading documentation of what blocks. | **observed** | read | none | Fix the comments. |
| QG-8 | Low | `scripts/ci/typecheck.mjs`, `emit-guard-matrix.mjs` | Both have smoke tests (`typecheck-gate.smoke.test.ts`, `emit-guard-matrix.smoke.test.ts`). But they are not named `check-*`, so `verify-guard-test-discrimination.mjs:43-45` never no-ops them. Their tests are not mutation-proven. | A small gap in the guard-the-guard scope. | **observed** | read `verify-guard-test-discrimination.mjs:43-45` | I did not read the two smoke tests in full. | Widen discovery to every `.mjs` a CI step runs (minus helpers). |

---

## Disconfirming-case-first record (Critical and High)

- **TST-1 / QG-1 (e2e never runs).**
  - *Hunt 1:* maybe e2e is false because no `src/` changed. Disproved: run 38795025359's detect-changes log lists 12 `src/` files and e2e was still skipped.
  - *Hunt 2:* maybe e2e runs elsewhere. Disproved: `cross-browser`, `a11y-audit`, and `visual-regression` are dispatch-only, and BrowserStack is `|| true` on `e2e/smoke` only.
  - *Hunt 3:* maybe it ran recently. Disproved: 59/60 runs from 10-10 to 10-30 skipped (one cancelled because gate failed). Samples from August and September are skipped. The last success was about 08-12.
  - What remains uncertain: the exact mechanism is inferred, not reproduced with a patched workflow.
- **TST-2 (31 Deno tests unrun).** *Hunt:* maybe directory entries cover them, or another workflow runs `deno test`. Directory prefixes were counted as covering. The only `deno test` in any workflow is `ci.yml:927`. Holds.
- **TST-3 (pgTAP informational).** *Hunt:* maybe it is required by the ruleset. The required list is CodeQL, dependency-advisories, secret-scan, dependency-review, gate, stryker. `db-test` is not among them and not in `gate.needs`. Holds.
- **TST-4 (parked workflows).** *Hunt:* maybe they were re-enabled. The `on:` blocks are `workflow_dispatch` only, and the latest runs are dated 2026-08-01/02. Holds.
- **BDD-1 (no runner).** *Hunt:* maybe there is a vitest-native Gherkin loader or a custom parser. Grep for `.feature` in all ts/mjs/yml finds only comments and `bdd-gate.yml`. The only `.feature`-like hits in `scripts/ci/_sql-scan.mjs` and `check-db-schema-present.mjs` are unrelated SQL tokens. No runner deps. Holds.
- **BDD-2 (no index or audiences).** *Hunt:* maybe there is an index under `docs/`. `git ls-files docs` has no feature, bdd, or use-case index. Holds.
- **QG-1 (aggregator unguarded).** *Hunt:* maybe `check-guards-wired` or `check-ci-guard-integrity` parses `gate.needs`. Their outputs and the grep show they check guard scripts only. Holds.

---

## Required CI checks (ruleset `main-security-gates`, id 23181685, enforcement active, `bypass_actors: []`, strict)

Source: `gh api repos/techfleetworks/techfleetnetwork/rules/branches/main` (observed 2026-10-30). Classic branch protection has `contexts: []`, so the ruleset is the only enforcer.

| Required check | What it checks | Enforcing? (evidence) | Discrimination test? |
|---|---|---|---|
| `gate` (ci.yml) | Aggregates gate-verify, gate-test (4 shards), coverage, gate-build, guard-matrix, lint-arch-critical (29 guards), security-owasp, arch-gate, migration-smoke*, db-schema-gate*, deno-check* (*skipped counts as pass) | Yes. `if: always()` plus explicit `success` checks (`ci.yml:424-469`). Main run 39055431104 shows all green. | Its member guards: yes (allowlist `[]`, observed). The aggregator itself: **no** (QG-1). |
| ↳ Type-check | `scripts/ci/typecheck.mjs`, per-project `tsc -p`, fails on zero files | Yes (`ci.yml:232-233`) | Smoke test yes. Mutation-proven: no (QG-8). |
| ↳ Coverage floor | merged v8 coverage ≥ 25/24/20/17 | Yes. Fails closed (local run: exit 2 on missing summary) | Yes (`check-coverage-floor.smoke.test.ts`, 6 cases incl. fail-closed). Ratchet: **no** (TST-6). |
| ↳ guard discrimination | no-ops every `check-*` and `arch-gate`, requires their tests to fail | Yes (`ci.yml:225-226`) | Yes (`verify-guard-test-discrimination.smoke.test.ts`) |
| ↳ security-owasp | `scripts/pentest/sast.mjs` plus `check-owasp-coverage.mjs` | Yes. Local: 49 pass, exit 0 | `check-owasp-coverage`: yes. `sast.mjs`: **no** (QG-4) |
| ↳ arch-gate | `--changed` ratchet over 305 waivers | Yes. Local full run: PASS (856 waived) | Yes (`arch-gate.smoke.test.ts`) |
| ↳ deno-check | `deno check` all functions plus 44/75 Deno tests | Only when `supabase/functions/` changes | No (TST-2) |
| ↳ migration-smoke / db-schema-gate | migrations apply from scratch / declared objects exist in prod | Conditional, blocking | db-schema: smoke tests exist (not re-read this pass) |
| `stryker` (mutation.yml) | Stryker on `src/lib/security.ts`, break 50 | Yes. Required, always reports. Last measured 53.78% | `check-mutation-gate-armed.smoke.test.ts` yes. It allows a lowered break (QG-3). |
| `secret-scan` (security.yml) | regex scan of tracked files | Yes. Local: 3099 files, exit 0 | **No** (QG-4) |
| `dependency-advisories` (security.yml) | npm-audit vs dated waivers | Yes | Yes (`check-dependency-advisories.smoke.test.ts`) |
| `dependency-review` (ci.yml) | GitHub action, fail on high | Yes (PR only) | Third-party; not applicable |
| `CodeQL` | GitHub default setup | Yes | Third-party; not applicable |

**Not required and not blocking:** `e2e` (dead, TST-1), `db-test` (TST-3), `lint-arch` standard lane (QG-5), `audit-triggers`, `lighthouse` (TST-5), `bdd-gate` (BDD-3), `bundle-size` (continue-on-error), `cross-browser` / `a11y-audit` / `visual-regression` (parked, TST-4), `browserstack-weekly` (`|| true`).

## Guard-integrity runs (observed this session, Node v24.17.0, 2026-10-30)

| Command | Result |
|---|---|
| `node scripts/ci/check-guards-wired.mjs` | exit 0. "55 guards all declare a CI lane (critical=29, standard=11, bespoke=15) … 0 on the shrink-only allowlist." |
| `node scripts/ci/emit-guard-matrix.mjs --lane critical` | exit 0. A 29-entry JSON array. |
| `node scripts/ci/check-ci-guard-integrity.mjs` | exit 0. "55 guard scripts scanned — none swallow an error into exit(0) …" |
| `node scripts/ci/check-mutation-gate-armed.mjs` | exit 0. "break=50 (> 0), mutate has 1 target(s) …" |
| `node scripts/ci/check-lighthouse-gate-armed.mjs` | exit 0 (48 lines scanned) |
| `node scripts/ci/check-coverage-floor.mjs` (no summary present) | **exit 2**. "cannot read coverage summary … Failing closed." This is the expected fail-closed behavior. |
| `node scripts/ci/check-edge-function-coverage.mjs` | exit 0. "125 edge functions all pinned" |
| `node scripts/ci/arch-gate.mjs` | exit 0. "PASS … (856 waived)" |
| `node scripts/pentest/sast.mjs` | exit 0. 49 pass / 0 fail |
| `node scripts/secret-scan.mjs` | exit 0. 3099 files |
| `node scripts/ci/check-guard-has-test.mjs` | exit 1, `ERR_MODULE_NOT_FOUND` (needs the `typescript` package; no node_modules here). Not a finding. It is green in CI run 39055431104. |
| `verify-guard-test-discrimination.mjs` | Not run (needs vitest). Green in CI `gate-verify`. |

## Prior-finding status

| Prior (2026-10-09) | Status now | Evidence |
|---|---|---|
| C1 vacuous type-check | **Fixed** | `ci.yml:228-233` → `typecheck.mjs`; #416 |
| H1/H2 no coverage gate | **Fixed (weak floor)** | `ci.yml:265-310`; floor 25/24/20/17; measured 27.04/25.61/21.35/19.20 |
| No product mutation | **Fixed (1 file)** | required `stryker`; 53.78% ≥ break 50 |
| Lighthouse `\|\| true` | **Fixed but not a PR gate** | `lighthouse.yml` has no `\|\| true`; still targets production and is not required (TST-5) |
| M1 permanent waivers | **Fixed (cliff)** | 305/305 expire 2027-04-30 (QG-6) |
| No contract / load / property / chaos tests | **Open** | TST-8, TST-9 |
| Flaky = retries:1 | **Open** | TST-10 |
| BDD gate weak grep | **Open, worse context** | BDD-1..3 |
| (missed) e2e and cross-browser credited as live | **Corrected: dead since August** | TST-1, TST-4 |

## Coverage of this audit
- **Read:**
  - all of `ci.yml`, `mutation.yml`, `bdd-gate.yml`, `lighthouse.yml`, `security.yml`
  - the `on:` blocks of cross-browser, a11y, and visual
  - `stryker.conf.json`, `vitest.config.ts`, `coverage-floor.json`
  - `check-coverage-floor.mjs`, `check-mutation-gate-armed.mjs`, `secret-scan.mjs`
  - the head of `verify-guard-test-discrimination.mjs` and `check-edge-function-coverage.mjs`
  - `check-coverage-floor.smoke.test.ts`
- **Counted:**
  - vitest files: 479 (244 of them guard smoke tests)
  - e2e: 46
  - pgTAP: 40
  - Deno tests: 75
  - guards: 55
  - feature files: 10 / scenarios: 99
- **GitHub:** the ruleset, about 80 CI run job lists, logs from 4 jobs, and the run history of 7 other workflows.

## Limitations
- I did not run vitest, Deno, Playwright, or Stryker. Coverage and mutation numbers are from CI logs, not reproduced.
- The e2e skip mechanism is inferred from GitHub semantics plus observed outcomes. I did not prove it with a patched workflow.
- Test assertion quality was not re-sampled this pass. I relied on the prior sample.
- I did not run or check the state of the 31 unrun Deno tests.
- The intended audiences for BDD (BDD-2) are inferred, not confirmed with the owner.
- GitHub API returned 502s on 2 of about 80 run lookups. Those runs were excluded from the counts.

## Fixes that need no production access
TST-1, TST-2, TST-3, TST-5, TST-6, TST-7, TST-8, TST-9, TST-10, all BDD items, and all QG items are repo-only changes.

TST-4 can also be done without production access, by seeding a local CI admin instead of using prod `TF_ADMIN_*` secrets. Only the original "restore TF_ADMIN_* secrets" route needs someone with repo-settings or secrets access.
