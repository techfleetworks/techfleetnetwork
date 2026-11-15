# ADR 20261106 — CI change-detection fails open (RC1)

- Status: accepted
- Date: 2026-11-06
- Deciders: engineering (enterprise-readiness remediation, Wave 1 / RP-A)

## Context

The re-audit (`docs/audit/reaudit-2026-10-30/`, finding **RC1**, Critical) found that the Playwright
`e2e` suite gates nothing: it was `SKIPPED` on every recent CI run, including a PR that changed `src/`
and three `main` pushes that changed `src/`. The cause is the `detect-changes` job's "Compute changed
paths" step:

```yaml
git fetch --no-tags --depth=1 origin "$base_ref"   # shallow base — no common ancestor
BASE="origin/$base_ref"
CHANGED=$(git diff --name-only "$BASE"...HEAD)       # three-dot needs a merge-base
```

A `--depth=1` base fetch leaves no merge-base, so `git diff base...HEAD` returns an **empty** set, and
every filter (`migrations`, `e2e`, `functions`, `db_schema`) evaluates to `false`. The PR branch had no
error handling, so a failed diff produced the same empty result. A skipped job reports as "not
applicable", so the miss was invisible. Three of those four filters feed **required** gates
(`migration-smoke`, `db-schema-gate`, `deno-check` via the `gate` aggregator), so the same bug could
silently skip a required check, not just `e2e`.

This is the "a gate cannot detect, so it passes vacuously" class the enterprise-readiness program ranks
highest.

## Decision

Detection **fails open by construction**. If the changed-file set cannot be computed reliably, every
change-gated job runs.

1. Replace the inline bash with `scripts/ci/detect-changed-paths.mjs` (zero-dependency node). It diffs
   against the **real merge-base** (full base fetch, no `--depth=1`) and returns `failOpen = true` on any
   fetch error, unresolved merge-base, git error, or empty diff. Under `failOpen`, every filter emits
   `true`. Running an unneeded job costs CI minutes; skipping a needed one is how a required test layer
   comes to gate nothing.
2. The classification core (`classify(changedFiles, failOpen)`) is a **pure function**, and the
   fail-open **decision** (`computeChanged`) is tested on its no-git branches (missing base ref,
   missing/zero before-sha). Both are exercised by `scripts/ci/detect-changed-paths.test.mjs`, which runs
   as a **blocking** step in `gate-verify`. The test reddens if fail-open is reverted in either the
   classify mapping or those decision branches (a discrimination test, per `verifiable-quality-gates`),
   and it caught a real regex bug — the `db_schema` pattern had wrongly anchored its `migrations/` prefix
   branch with `$` — before merge. **Coverage limit:** the one branch that still needs a live git repo
   (a reliable but *empty* diff mapping to fail-open) is exercised only at CI runtime, not in the unit
   test.

3. The git CLI is invoked with `execFileSync` and argument arrays (no shell), so an env-derived value
   (base ref, before-sha) can never be interpreted as a command.

**Scope / what this ADR deliberately does NOT do:** it does not make `e2e` a merge-blocking check. `e2e`
has **never actually run** (skipped on every recorded run), so there is no evidence it passes; making a
never-run 6-shard browser suite blocking would brick every `src`-touching PR. With this fix `e2e` now
*runs* on `src`/`functions` PRs as a non-blocking signal. Wiring it into the `gate` aggregator
(skipped-as-pass) is a **follow-up** gated on observing it green on real PRs; making it a required
ruleset check remains an owner action (held tier).

## Alternatives considered

- **Keep the inline bash, just drop `--depth=1`.** Fixes the merge-base but stays untested; a future
  edit can silently reintroduce a skip. Rejected — no discrimination test, no prevent-by-construction.
- **Make `e2e` blocking now (add to `gate` or the ruleset).** `e2e` `needs: gate`, so adding it to the
  `gate` aggregator is a dependency cycle; and it has never passed, so blocking blind would brick `src`
  PRs (including the sibling Wave-1 PRs). Deferred until observed green.
- **Fail closed (skip on error).** The status quo; it is exactly what hid RC1.

## Consequences

- A broken merge-base can no longer silently skip `e2e`, `migrations`, `functions`, or `db_schema`; the
  three required gates among them are hardened immediately.
- On an unreliable diff, CI runs all change-gated jobs (more minutes, never a silent skip); a `::warning::`
  names the reason.
- `e2e` now runs on `src`/`functions` PRs (non-blocking) — producing the first real signal on whether it
  passes, which unblocks the follow-up to make it gate.
- The detection logic is now a tested unit, not untested inline YAML.
