# ADR 0047 — Derive the CI guard matrix from self-declared lanes; no hand-maintained matrix list

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `.github/workflows/ci.yml` (the two `lint-arch*` jobs + new `guard-matrix` job), `scripts/ci/emit-guard-matrix.mjs`, `scripts/ci/_guard-lane.mjs`, `scripts/ci/check-guards-wired.mjs`, `decisions.md` §6. Second in the anti-conflict series after **ADR-0046** (self-declared bespoke-dir-reader markers); same pattern, next-highest-frequency central list. Remaining series items: split `decisions.md` into fragments; collision-free ADR ids; drop-only schema baseline. Skills: `arch-encode`, `enterprise-architecture-standards`, `release-deployment-safety`.

## Context and problem statement

Adding a CI guard required appending its filename to one of **two hand-maintained matrix lists** in `ci.yml` — `lint-arch-critical` (blocking auth/security invariants) or `lint-arch` (informational). Every guard PR edited the same list, so two guard PRs in flight collided on that hunk — the same per-merge conflict churn ADR-0046 removed for `check-ci-guard-integrity`'s `BESPOKE_DIR_READERS` Set. The list's _content_ was fine; its _shape_ — one file every guard PR must edit — is the conflict magnet.

The lists also drift silently: `check-guards-wired.mjs` verified a guard was "referenced in a workflow," but nothing kept the critical/standard split honest or caught a guard added to the repo but never wired.

## Decision drivers

- **Remove the conflict structurally**, not by rebasing faster — make the declaration local to the guard, as in ADR-0046.
- **Preserve the blocking/informational split** — it is a real property (auth/security guards must block merge; others are advisory).
- **No false-green.** A derived matrix that silently becomes empty would run zero guards and pass vacuously — the exact defect the guard fleet exists to prevent. The derivation must fail closed.
- **Keep bespoke guards' special setup.** Some guards need `fetch-depth:0` (git-diff shrink ratchets), prod credentials (schema-present), or an own job (OWASP, dependency advisories); these keep hand-written steps.

## Considered options

1. **Keep the two hand-maintained matrix lists.** Rejected: they _are_ the conflict source.
2. **A central manifest file** (`guards.json`) mapping guard → lane. Rejected: a manifest is still one central list every guard PR appends to — it moves the conflict, doesn't remove it.
3. **Per-guard self-declared lane + derived matrix (chosen).** Each guard carries `// ci-lane: critical|standard|bespoke` in its own file; a generator (`emit-guard-matrix.mjs`) emits the `critical`/`standard` arrays, and the two matrix jobs consume them via `fromJSON`. Adding a guard edits only that guard's file.
4. **Convention by directory** (`scripts/ci/critical/…`). Rejected: moving 33 files breaks every `node scripts/ci/check-X.mjs` reference, tests, and `check-guard-has-test`; far more invasive than a marker line.

## Decision outcome

**Chosen: Option 3.** A new `guard-matrix` job (zero-dependency, node built-ins) runs `emit-guard-matrix.mjs --github-output` and exposes `critical` / `standard` job outputs; `lint-arch-critical` and `lint-arch` set `matrix.check: ${{ fromJSON(needs.guard-matrix.outputs.<lane>) }}`. The 47 guards each gained a `// ci-lane` marker (23 critical, 10 standard, 14 bespoke) — a **1:1 reproduction** of the previous hand-maintained lists. `_guard-lane.mjs` owns the marker convention (imported by both the generator and `check-guards-wired.mjs`); the marker is matched exactly like ADR-0046's (leading content of a single comment line).

`check-guards-wired.mjs` is rewritten to the lane model: every guard must declare a valid lane; critical/standard ride the derived matrix; bespoke guards must have a live workflow step; and `emit-guard-matrix.mjs` must itself be wired, or the whole matrix would run nowhere.

## Consequences

**Good**

- The `ci.yml` matrix-list conflict class is dead: a new guard is a one-file change (its `// ci-lane` marker); two guard PRs no longer collide in `ci.yml`.
- The critical/standard/bespoke classification is now visible in each guard's own source, next to what it guards.
- Fail-closed by construction: `emit-guard-matrix.mjs` exits non-zero if any guard lacks a valid lane or if either matrix lane is empty, and the `guard-matrix` job is wired into the required `gate` aggregator — a broken/empty matrix blocks merge instead of passing vacuously.

**Bad / accepted**

- The `fromJSON` dynamic-matrix wiring is only fully exercisable in CI (not locally). Mitigated: the generator is unit-tested against fixtures, the derived set was proven 1:1 with the old lists, and this PR's own CI exercises the real wiring before merge.
- One-time cost: 47 guards each gained a marker line, `check-guards-wired` was rewritten, and its smoke test re-authored. Accepted — a single migration, no recurring cost.
- Third central-list source remains (`decisions.md`, sequential ADR ids, schema baseline) — sequenced follow-ups.

## Confirmation

- `src/test/smoke/emit-guard-matrix.smoke.test.ts` (8 scenarios) pins the generator: correct classification, `--github-output`/`--lane` formats, and fail-closed on a missing lane, an invalid lane, and an empty critical or standard matrix lane.
- `src/test/smoke/check-guards-wired.smoke.test.ts` (10 scenarios) pins the rewritten wired-check: a guard with no/invalid lane is flagged; a bespoke guard with no live step is flagged; the generator being unwired fails closed; the allowlist exempts a deferred bespoke guard; the real repo passes.
- `emit-guard-matrix.mjs` output verified 1:1 against the previous hand-maintained matrix lists (23 critical, 10 standard). `check-ci-guard-integrity`, `check-guard-has-test`, `verify-guard-test-discrimination`, and `arch-gate` stay green.
