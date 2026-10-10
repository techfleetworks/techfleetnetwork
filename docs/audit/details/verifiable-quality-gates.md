# Audit — Verifiable Quality Gates (TechFleet Network)

**Auditor dimension:** Can every automated check ACTUALLY detect what it claims? (coverage gates with real
thresholds, mutation testing, guard-the-guard discrimination, fail-closed behavior, no vacuous/no-op gates,
no false greens, waiver hygiene).
**Target (read-only):** `C:/Users/morga/Documents/tfn-audit`
**Date:** 2026-10-09
**Standard applied:** `verifiable-quality-gates` SKILL.md + 3 references (mutation-gate, check-test-patterns,
owning-layer-and-ratchet).

---

## SCORE: 64 / 100 — Band: ADEQUATE, MATERIAL RISK (60–74)

The guard-the-guard subsystem (discrimination/mutation gate over the CI guards) is genuinely **exemplary** —
among the most sophisticated I have audited. But the dimension's central question is "can *every* automated
check detect what it claims," and two material holes drag the score into the adequate band:

1. A **required** gate that detects nothing (the Type-check gate is vacuous on this tree) — a live false green.
2. **No application-code coverage gate and no application mutation testing** — the repo's "tests green" signal
   is unquantified and unproven against product-code regressions.

### Weighted sub-criteria

| # | Sub-criterion | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | Guard discrimination (mutation-of-guards) system | 25% | 96 | 24.0 |
| 2 | Fail-closed behavior + no-vacuous meta-guards | 20% | 92 | 18.4 |
| 3 | Application coverage gate w/ real threshold | 20% | 15 | 3.0 |
| 4 | Application mutation testing | 10% | 35 | 3.5 |
| 5 | No false greens / no vacuous REQUIRED gates | 20% | 45 | 9.0 |
| 6 | Waiver hygiene (dated/expiring/shrinking) | 5% | 55 | 2.75 |
| | **Total** | **100%** | | **~60.6 → 64** |

(Rounded up to 64: the discrimination subsystem is strong enough that it partially compensates sub-criterion 5,
since the *guard* corpus itself cannot ship a false green even though one non-guard required gate can.)

---

## STRENGTHS (credit where earned)

### S1 — Guard discrimination / mutation gate is real, blocking, and burned down to ZERO (VERIFIED)
- `scripts/ci/verify-guard-test-discrimination.mjs` implements the skill's core mechanism almost exactly: it
  no-ops **every tested guard**, runs the smoke suite once, reads vitest's JSON report, and fails if any
  guard's test still **passed** against the no-op (vacuous). Restores all guards in a `finally`
  (lines 110–139). Fails closed on: unreadable CI dir, zero guards, missing allowlist, unmappable
  test→guard, unreadable JSON report (lines 46–49, 57, 103–108, 144–147).
- **The burn-down allowlist is empty:** `scripts/ci/guard-test-allowlist.json` = `[]`
  (VERIFIED, file read). Per the skill's shrink-only ratchet, this means **every** guard
  (`check-*.mjs` + `arch-gate.mjs`) now has a committed, discrimination-proven test — the ideal end state
  ("when the allowlist reaches empty… every check now has a committed test that provably discriminates").
- Scale: 237 `*.smoke.test.ts` files under `src/test/smoke/`; ~101 assert a **non-zero** exit
  (`toBe(1)`/`toBe(2)`/`toBeGreaterThan(0)`) — i.e. real detection, not happy-path-only (VERIFIED by grep,
  with a caveat that grep counts files, not individual assertions).
- Wired + blocking: ci.yml line 225–226 runs it in `gate-verify`, which is in the required `gate`
  aggregator `needs[]` (lines 355–367). Re-runnable: `node scripts/ci/verify-guard-test-discrimination.mjs`.
- Re-runnable source for allowlist: `cat scripts/ci/guard-test-allowlist.json`.

### S2 — Coverage gate for guards (check-guard-has-test) uses AST, not string matching (VERIFIED)
- `scripts/ci/check-guard-has-test.mjs` parses each candidate test with the **TypeScript compiler API** and
  credits a guard only if its path is passed to an actual `exec*/spawn*/fork` call, resolving
  `const X = resolve(...)` bindings and **refusing to resolve ambiguous (2+ declared) names**
  (lines 188–244). This is a root-cause fix for the "comment-mention counted as coverage" and "per-blob
  cross-credit" false positives that `judge-arch` caught on PR #310 (documented in-file, lines 139–144).
  This is materially better than the skill's own reference `check-has-test.mjs` (which the skill ships as a
  simpler string-based gate). Fails closed on every missing input (exit 2).

### S3 — Three mutually-reinforcing meta-guards make "a guard silently stops protecting" structurally hard
- `check-ci-guard-integrity.mjs` — forbids `exit(0)` in a `catch` (false green), `new URL().pathname`
  (Windows crash-instead-of-verify), and hand-rolled directory walks outside the `_guard.mjs` harness;
  self-declared `bespoke-dir-reader` opt-out via an **anchored** regex so a string/prose mention can't
  self-exempt (lines 47–48, 112–119). Fails closed on zero guards.
- `check-guards-wired.mjs` — every guard self-declares a `// ci-lane:` and must actually run; the derivation
  generator (`emit-guard-matrix.mjs`) is itself asserted wired (lines 85–89). `guards-wired-allowlist.json`
  = `[]` (nothing deferred). Fails closed.
- `check-guard-has-test.mjs` (S2). Together with the required `gate`, a guard cannot be added unclassified,
  untested, vacuous, or unwired. This is the AGENTS.md "catch the invisible failure" thesis, mechanized.

### S4 — "Verify reality, not a ledger" is applied (VERIFIED, decisions.md §6 + ci.yml)
- `check-db-schema-present.mjs` queries prod for the **actual schema objects** the migrations declare
  (11 categories) via the Management API, fails closed on no token/unreachable/below-floor (decisions.md
  lines 327–347). This directly fixed the ADR-0020 vacuous migration gate (which read a `schema_migrations`
  ledger that doesn't exist in prod → errored → skip-green). This is exactly the skill's anti-vacuity lesson.

---

## FINDINGS

### CRITICAL

#### C1 — The required Type-check gate is VACUOUS (false green on every TypeScript regression)
- **Evidence:** `tsconfig.json` has `"files": []` and only `"references": [tsconfig.app.json, tsconfig.node.json]`
  (VERIFIED, file read, lines 15–23). `ci.yml` line 229 runs `npx tsc --noEmit` — **not** `tsc -b/--build`.
- **Why it's a false green:** `tsc --noEmit` against a config with `files: []` and no `include`, without
  `--build`, does **not** follow project references and has an **empty** input set → it compiles **zero**
  project files and exits 0 unconditionally. A real type error anywhere in `src/` sails through the required
  `gate`. The production build (`vite build`, SWC) does **not** type-check either, so no other gate-job
  compensates.
- **Corroboration:** This is the *exact* class the repo's own memory records as previously found
  ("CI Type-check gate was a vacuous no-op — bare `tsc` vs references-only root tsconfig → 0 files, always
  green"), with the fix (per-project `tsc --noEmit -p` runner, ADR-0068) in **PR #416 which is OPEN / not
  merged**. This tree still carries the pre-fix, vacuous invocation.
- **Evidence state:** VERIFIED structurally (tsconfig + ci.yml), and by TypeScript's documented reference
  behavior. **Named limitation:** I could NOT execute `tsc` empirically — `node_modules` is not installed in
  this worktree and `npx tsc` resolved to an unrelated global hoax package. The conclusion rests on static
  config analysis + known compiler semantics, not a live red/green demonstration on this box.
- **Re-runnable source (in a tree with deps):**
  `node ./node_modules/typescript/bin/tsc --noEmit --listFilesOnly | grep -c /src/` → expect **0**; then
  introduce a type error in a `src/*.ts` and run `npx tsc --noEmit` → it will still **exit 0**.
- **Smallest fix:** switch the CI step to `tsc -b` (build mode follows references) or the per-project runner
  from PR #416/ADR-0068, and add a discriminating guard-test that injects a type error and asserts non-zero.

### HIGH

#### H1 — No application-code coverage gate with a real threshold
- **Evidence:** `vitest.config.ts` has **no `coverage` block** (VERIFIED, full file read — 32 lines, none
  about coverage/thresholds). `package.json` has **no `@vitest/coverage-v8`/`-istanbul`, no `c8`/`nyc`**
  dependency (VERIFIED). `ci.yml` `gate-test` runs `npx vitest run --shard=…` with **no `--coverage`**
  (lines 261–262). No `lines/branches/functions/statements` threshold is enforced anywhere.
- **Impact:** The skill and the org's `comprehensive-test-strategy` require a coverage gate with a real
  threshold; the DoD in `CLAUDE.md` only requires "tests green." "Green" here means "the tests that exist
  passed," with **no floor on how much code is exercised** — new untested code merges freely, and coverage
  can silently erode. The guard corpus is rigorously proven (S1–S3) while the ~288-file **application** test
  suite has no quantified detection floor.
- **Evidence state:** VERIFIED (absence across config/deps/CI). **Limitation:** I did not measure actual
  coverage %, only that no gate enforces one.
- **Re-runnable source:** `grep -r coverage vitest.config.ts package.json .github/workflows/ci.yml` → no
  threshold hits.

#### H2 — No mutation testing of application code
- **Evidence:** No `stryker`/`@stryker-mutator/*` in `package.json`; no mutation config anywhere
  (VERIFIED by grep for `stryker|mutation`). The only mutation testing is `verify-guard-test-discrimination`,
  which mutates the **guards**, not product code.
- **Nuance / partial credit:** The `verifiable-quality-gates` skill scopes mutation testing to the *checks*
  (done, excellently). Product-code mutation is owned by `comprehensive-test-strategy`. So this is a real gap
  against the broader test strategy, but the skill-specific ask (prove the *gates* discriminate) is met. Hence
  sub-criterion 4 scores 35, not 0.
- **Evidence state:** VERIFIED (dependency/config absence).

### MEDIUM

#### M1 — Waiver backlog: 305 entries, ALL permanent (no expiry set, no dates), single rubber-stamp approver
- **Evidence:** `arch-gate.waivers.json` = 305 entries (VERIFIED, parsed). **0** have a non-empty `expires`
  field; **305/305** are `approvedBy: "baseline"`; no `date`/`added`/`created` key exists. The arch-gate code
  *does* honor expiry (`arch-gate.mjs:155` — `if (w.expires && new Date(w.expires) < new Date()) return false`),
  so the mechanism is present but **completely unused** — every waiver is a permanent grandfather with no
  forcing function to ever clean it up.
- **Distribution:** 103 "edge functions hand-roll CORS/responses," 100 "UI accesses DB directly," 93 "edge
  hand-roll auth/service-role secrets," 6 services-import-UI, 3 keep-in-sync. These are real architectural debt
  masquerading as "approved."
- **Trend (UNVERIFIED):** The repo's memory references ~1525 entries previously; this snapshot is 305, and the
  gate is a shrink-only `--changed` ratchet (blocks NEW violations), with active burn-down noted elsewhere
  (projects data-access refactor). Directionally shrinking, but **I cannot verify the trend from a single
  snapshot** (no git history available — this path reports as not a git repo).
- **Evidence state:** Counts VERIFIED; trend UNVERIFIED.
- **Re-runnable source:** `node -e "const w=require('fs');…"` over `arch-gate.waivers.json` (see audit notes).
- **Smallest fix:** backfill `expires` dates on the top debt clusters so the ratchet forces attrition, not
  just prevention; require a real approver on any *new* waiver.

### LOW

#### L1 — `check-ci-guard-integrity.mjs` is cwd-relative, not self-located
- **Evidence:** line 28 — `const DIR = join(process.cwd(), "scripts/ci")`. Unlike the self-located pattern
  (`fileURLToPath`) it enforces on *others*, this meta-guard scans relative to cwd. Harmless in CI (cwd = repo
  root) but would silently scan the wrong/empty dir if ever invoked from elsewhere — though it fails closed on
  a zero-file scan, so the worst case is a loud false-red, not a false-green. Minor inconsistency.
- **Evidence state:** VERIFIED. **Limitation:** no observed failure; purely a robustness nit.

#### L2 — Discrimination gate maps test→guard by loose regex while coverage gate uses AST
- **Evidence:** `verify-guard-test-discrimination.mjs:90` maps via `/scripts\/ci\/([\w-]+\.mjs)/g` string
  match, whereas `check-guard-has-test.mjs` uses the TS AST. For the mutation gate this is acceptable (a
  superset mapping only makes it *stricter*), and it fails closed on unmapped guards. Noted for completeness,
  not a defect.

---

## WHAT I COULD NOT VERIFY (honest limitations)
- **No `node_modules`** in this worktree → I could not *execute* `tsc`, `vitest`, the discrimination gate, or
  any guard to see live red/green. All exec-level claims rest on source reading + known tool semantics.
- **No git history** at this path → waiver-trend (shrinking vs growing) is inferred, not measured.
- Smoke-test "discriminating" count is **file-level** (grep), not a per-assertion audit; the mutation gate is
  the real proof those tests discriminate, and it is wired + blocking (so I credit it), but I did not run it.

## BOTTOM LINE
The **guard-the-guard** system is the best part of this repo and a model of the skill: empty burn-down
allowlist, a real blocking mutation gate, AST-based coverage crediting, fail-closed meta-guards, and
"verify reality not a ledger." That earns real credit. But the dimension asks whether *every* check detects
what it claims, and the answer is no in two material ways: a **required Type-check gate that type-checks zero
files** (a live CRITICAL false green on this tree), and **no coverage or mutation gate on the application code
itself** — so the product-code "green" signal is unquantified. Fix C1 and add a coverage threshold and the
score jumps into the enterprise-ready band.
