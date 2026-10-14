# TechFleetNetwork CI/CD audit, through the enterprise skills

Audit of techfleetnetwork's CI actions, graded against each enterprise engineering skill's standard
(dogfooding the v1.0.0 skills installed on this machine), with the evidence discipline the skeptical-audit
skill requires: every finding carries an evidence state, a re-runnable source, and a named limitation.

- **Scope:** `.github/workflows/` (23 files) + the `scripts/ci/` guard suite + `scripts/lint/` plugins + the
  test/config files that define the gates, on `origin/main @ 62f2c72ba` (2026-10-14).
- **Method:** each skill is the rubric for its domain. For every gate the verifiable-quality-gates verdict is
  one of: REAL (provably detects, ideally with a discrimination test), WEAK (detects something but shallow or
  low-bar), VACUOUS (cannot fail / fails open), or MISSING. Severity is the blast radius of the class the gate
  is meant to catch slipping through.
- **Evidence states used:** `observed` (read first-hand from the file this session), `reported` (from the
  survey subagent, cited but not re-read by me), `documented` (a repo comment or ADR asserts it),
  `not-assessed` (cannot be determined from the repo).

## Headline verdict

TFN's CI is **more mature than a quick look suggests, with one standout strength and a cluster of real holes.**

- **Standout strength (observed):** TFN already runs the verifiable-quality-gates discipline **for its guards**.
  `verify-guard-test-discrimination.mjs` no-ops each guard and requires its test to FAIL; `check-guard-has-test`,
  `check-guards-wired`, and `check-ci-guard-integrity` back it. That is exactly what the VQG skill preaches, and
  it is already blocking. The refactor builds on this spine; it does not replace it.
- **The core problem:** that discipline covers the ~54 guards but **not product code and not several whole
  domains**. The result is a handful of gates that look like enforcement but cannot fail, and three domains that
  are effectively ungated on the PR.

Overall: the architecture, migration-safety, GDPR-erasure, auth, and SAST domains are genuinely strong. The
test-efficacy, accessibility, cross-browser, and BDD domains are where a green check is currently misleading.

## The strong foundation (keep, do not touch)

| Domain | Gate | Why it holds (evidence) |
|---|---|---|
| Verifiable gates (for guards) | `verify-guard-test-discrimination` + `check-guard-has-test` + `check-guards-wired` + `check-ci-guard-integrity` + per-guard smoke tests | the mutation-proven, self-proving guard layer (reported, consistent with the file names observed) |
| Architecture | `arch-gate.mjs --changed` (four-questions ratchet, blocking) + the auth-freeze guard family | blocking structural ratchet; new violations fail (reported) |
| Release / migration safety | `migration-smoke` (full history on local PG) + `check-db-schema-present` (ADR-0036) + `check-migration-expand-contract` | destructive-DDL + committed-but-unapplied classes are gated (reported) |
| Compliance (erasure) | `check-erasure-completeness.mjs` (ADR-0039, critical) | the winning `handle_user_deletion()` must erase all 12 registered PII tables (reported) |
| Type-check | `scripts/ci/typecheck.mjs` with a `--listFilesOnly` non-vacuity probe | the old 0-files no-op is fixed and proven non-vacuous (reported; this is the pattern to copy elsewhere) |
| OWASP SAST | `scripts/pentest/sast.mjs` (blocking in `security-owasp`) | a real source sweep, not just traceability (reported) |

## Findings, by skill domain

### 1. verifiable-quality-gates — the product-code mutation gate is VACUOUS (HIGH)

- **Standard:** every check ships a test that fails when the check is neutralized, and fails closed; a gate that
  cannot go red is theater.
- **Observed:** `stryker.conf.json` has `"mutate": ["src/lib/security.ts"]` (a single file) and
  `"thresholds": { "break": 0 }`. `mutation.yml` "fails when the score drops below break," but **break = 0 can
  never fail** (any score >= 0 passes), and it covers one file. Source: `stryker.conf.json` read this session.
- **Why it matters:** this is the one workflow meant to prove product tests actually assert something. It cannot.
  Outside `src/lib/security.ts`, nothing proves the product suite detects a regression (and the coverage floor is
  17-25%, see finding 5). The guard layer is proven; the application is not.
- **Fix (build, TFN-native):** set `break` to a real floor (start at the current measured score minus a margin,
  shrink-only upward like the coverage floor), and broaden `mutate` to the critical modules (`src/lib/**`, the
  services/auth seams). Severity HIGH because it is the headline "are our tests real" gate.

### 2. universal-accessibility-wcag — no a11y gate actually tests the PR (HIGH)

- **Standard:** a11y is verified on the change, with axe on the rendered UI plus the manual-criteria checklist;
  a clean automated run means "no detectable issues," not "accessible."
- **Observed:** three independent weaknesses. (a) `lighthouse.yml` runs `lhci collect --url=https://www.techfleet.network/...`
  against **production**, with `accessibility=error:0.9` the only hard assertion — so a PR cannot fail on its own
  a11y regression, and a clean PR can be failed by unrelated prod drift (source: lighthouse.yml lines 25-39,
  read this session). (b) `eslint.config.js` maps the entire `jsx-a11y` recommended set to `"warn"` and
  `npm run lint` has no `--max-warnings`, so static a11y never blocks (source: eslint.config.js line 121). (c)
  `a11y-audit.yml` (axe route scan) is `workflow_dispatch`-only / parked because the admin secrets were never
  migrated (reported).
- **Fix (copy + build):** per your decision, rebuild a11y against **local Supabase in Docker** (the way Playwright
  e2e already runs), and **copy** the enterprise-skills `check-axe-results` verdict gate + the combined
  WCAG/508/ADA checklist gate, tuned to TFN's routes. Separately, promote the testable jsx-a11y rules to
  blocking. Keep Lighthouse for a prod perf trend, but stop treating it as the PR a11y gate. Severity HIGH.

### 3. universal-browser-device-support — cross-browser is parked, compat lint is warn-only (MED)

- **Standard:** works across the committed support matrix; feature detection, never UA sniffing; runtime
  cross-browser testing in CI.
- **Observed/reported:** `cross-browser.yml` and `visual-regression.yml` are parked (dispatch-only);
  `eslint-plugin-compat` and the stylelint browser-features rule are warn-level. No blocking cross-browser gate.
- **Fix (copy + revive):** copy the enterprise-skills `check-no-ua-sniffing` static gate (cheap, blocking, no
  infra) now; revive `cross-browser.yml` against local Supabase later (Wave 3). Severity MED (static-only until
  revived).

### 4. bdd-comprehensive-testing — the BDD gate is a shallow grep (MED)

- **Standard:** behaviors enumerated as Gherkin, stored and indexed, wired into CI as executable blocking tests.
- **Observed:** `bdd-gate.yml` checks only whether some test file under `src/test`/`e2e` contains the changed
  module's path or a >=6-char basename (`grep -rl "$mod" src/test e2e`). It is satisfied by any incidental
  mention; it requires no scenario and no behavioral assertion (source: bdd-gate.yml lines ~55-80, read this
  session). Only 10 `.feature` files exist and no Cucumber runner is in `package.json` (reported).
- **Fix (copy + build):** decide whether BDD is a real goal for TFN. If yes, add an executable runner for the
  features and copy the enterprise-skills gherkin-valid / coverage / tags gates; if not, relabel the grep as the
  advisory "a changed module has *a* test" check it actually is, so it stops reading as a BDD gate. Severity MED.

### 5. comprehensive-test-strategy — coverage floor is low; e2e does not block (MED)

- **Standard:** the full pyramid, with coverage and mutation as quality gates at a bar that means something.
- **Observed:** `coverage-floor.json` is lines 25 / statements 24 / functions 20 / branches 17 (source read this
  session). It is a sound shrink-only ratchet, but the absolute bar is weak. Reported: Playwright e2e runs
  `needs: gate` (after the aggregator), so its failure does not fail the required `gate` check; pgTAP `db-test`
  is informational.
- **Fix (build):** ratchet the coverage floor upward on a schedule (it is designed to rise); decide whether e2e
  and pgTAP should join the blocking set once they have a stable green baseline. Severity MED.

### 6. owasp-secure-coding-bdd — strong SAST, but a stale CodeQL reference and traceability-not-efficacy (LOW-MED)

- **Standard:** threat-model every change; secure-coding controls proven, each with a `@security` scenario.
- **Observed:** `security.yml` and a workflow comment reference CodeQL as a separate required workflow, but **no
  `codeql.yml` is committed on main** (source: `git ls-tree origin/main .github/workflows` read this session —
  no codeql file). So either CodeQL runs via GitHub default-setup (not verifiable from the repo) or the reference
  is stale and a required check is absent. Reported: `check-owasp-coverage.mjs` proves all cheat sheets are
  mapped and the referenced paths exist, but a sheet can be "covered" by a `doc:`/`n/a:` token with an 8-char
  justification, so coverage proves traceability, not that each control detects anything (the real enforcement is
  the blocking `sast.mjs`).
- **Fix (verify + build):** confirm whether CodeQL is actually running (GitHub default-setup) and either commit
  `codeql.yml` or correct the stale reference; tighten the coverage gate so a `doc:`-only mapping cannot stand in
  for a control that can fail. Severity LOW-MED (SAST already blocks; this is the completeness/honesty layer).

### 7. architectural-decision-records — ADR enforcement is collision-only (LOW-MED)

- **Standard:** no architecturally significant change is done without an ADR committed in the same change.
- **Observed/reported:** `check-adr-number-collision.mjs` blocks duplicate numbers, and 80 ADRs exist, but
  **nothing requires that an architectural change ship an ADR**. TFN also still uses 4-digit ADR numbers (a
  recurring collision source that memory notes a date-prefix fix for).
- **Fix (build, the routing pattern):** add a routing rule in the style of the enterprise-skills routing gate -
  a change touching `src/services/**`, `supabase/migrations/**`, or the auth seams requires an ADR (or an
  explicit waiver) in the same PR. Severity LOW-MED.

### 8. sre-operational-readiness — monitors exist but several self-skip; no symptom-vs-cause alert gate (MED)

- **Standard:** SLOs, symptom-based alerts that do not page on noise, and signals that actually run.
- **Reported:** `config-preflight.yml`, `incident-gate.yml`, `pentest.yml` self-skip green when their secrets are
  unset, so whether they run in prod is not verifiable from the repo; there is no CI check that alert rules page
  on a user-facing symptom rather than a bare resource cause.
- **Fix (copy if applicable):** make the self-skip explicit (a skip should be visible, not a silent green), and
  if TFN has committed alert-rule files, copy the enterprise-skills `check-alert-hygiene` gate over them.
  Severity MED (operational blind spot, not a merge-blocking code defect).

### 9. compliance-data-lifecycle — erasure is strong; new unclassified PII is ungated (MED)

- **Standard:** every personal-data column classified, with a lawful basis and a retention period, and the
  erasure path covers all of them.
- **Reported:** `check-erasure-completeness.mjs` is a real GDPR-Article-17 gate, but it relies on a hand-maintained
  `REQUIRED` list of 12 PII tables - so a NEW personal-data column added without updating that list is not caught.
- **Fix (copy + tune):** copy the enterprise-skills `check-untagged-pii` gate (every PII-looking column must be
  classified in a committed data-map) and `check-retention-basis`, tuned to TFN's schema. These complement the
  erasure gate by catching the unclassified-column-at-source class the erasure list cannot. Severity MED.

### 10. usability-ux-universal-design — no gate (BY DESIGN, state it)

- **Standard:** the skill itself ships no mechanical gate; usability is a judgment call backed by heuristics and
  lightweight testing.
- **Verdict:** correctly ungated. The honest move is to say so in the CI docs rather than imply coverage.

### 11. Governance / self-proving CI (observed limitation)

- There is **no `.github/rulesets/` or `CONTRIBUTING.md` in the repo**, so which checks actually block merge is
  asserted only in `ci.yml`'s own comment (that `ci / gate` + `migration-smoke` + the Cloudflare build are
  required). That is documented, not proven. For a CI whose whole point is enforcement, the required-check set
  should itself be committed and guarded (the enterprise-skills repo commits its ruleset + a test that the
  required set can only grow). Severity MED (an un-committed required-set can be weakened invisibly).

## Prioritized fix list (feeds the refactor waves)

1. **HIGH - make test-efficacy real:** give the product mutation gate a non-zero break and real scope (finding 1);
   ratchet the coverage floor (finding 5).
2. **HIGH - a real PR-scoped a11y gate** against local Supabase; promote jsx-a11y to blocking (finding 2).
3. **MED - fill the ungated domains:** untagged-PII + retention (finding 9); no-UA-sniffing now, cross-browser
   revived later (finding 3); the ADR routing rule (finding 7).
4. **MED - stop the misleading greens:** relabel or upgrade the BDD grep (finding 4); make self-skipping
   workflows skip visibly (finding 8); confirm/commit CodeQL (finding 6).
5. **MED - commit the required-check set** and guard it (finding 11).

Every fix carries an ADR, a discrimination test (TFN already has the harness), a judge-arch review, and a
skill-application receipt - the refactor dogfoods the skills it installs.

## Honest limits of this audit

- Required/blocking status for every workflow outside the `ci/gate` aggregator is from `ci.yml`'s comment, not a
  committed branch-protection file (none exists) - treat those as documented, not proven.
- Whether secret-gated workflows (pentest, config-preflight, incident-gate, the parked a11y/cross-browser) run in
  the live project is not determinable from the repo.
- Findings marked `reported` come from the survey subagent with cited paths; I re-read the six headline items
  first-hand (Stryker break:0, Lighthouse prod URLs, jsx-a11y warn, BDD grep, coverage floor, no codeql.yml). A
  full guard-by-guard re-read of all 54 guards was not done; the strong-foundation verdicts rest on the survey's
  cited reads plus the self-proving meta-gates.
