# ADR 0068 — Delta-mode dependency-advisory gate: PRs block only on advisories they introduce

- Status: Proposed
- Date: 2026-10-08
- Deciders: Morgan Denner (chose delta gating over scope/severity narrowing)
- Epic: Security / Supply-chain / CI gates
- Related:
  - `scripts/ci/check-dependency-advisories.mjs` — the gate (this change).
  - `src/test/smoke/check-dependency-advisories.smoke.test.ts` — the guard-the-guard smoke test (extended).
  - `.github/workflows/security.yml` — runs the gate on `push:[main]`, `pull_request`, weekly `schedule`, and `workflow_dispatch` (no change needed; the script auto-detects mode).
  - ADR-0041 — the original blocking dependency-advisory gate + expiring-waiver model.
  - ADR-0067 is unrelated (Class Admin IA); this is the next free number.
  - Supersedes nothing; refines ADR-0041's enforcement.

## Context

The dependency-advisory gate (ADR-0041) runs `npm audit` over the **entire** dependency tree and
fails on **any** advisory not covered by an unexpired waiver. `npm audit` is evaluated against a
**live, ever-growing advisory database**, so the same unchanged lockfile flips from green to red as
new advisories are published — with **no code change**. Because the gate is a required check, that
drift blocks **every** open PR, not just ones that touched dependencies.

This bit us twice in two weeks:

1. A stale `undici` override floor + `ip-address` surfaced 3 moderate advisories (fixed in #404, ADR-0066).
2. **Eight days later, while #404 was still open, the SAME lockfile drifted to 12 unwaived advisories**
   across 9 packages (brace-expansion, braces, @vue/server-renderer, dompurify, fast-uri,
   http-cache-semantics, postcss-selector-parser, sharp, source-map-js) — none introduced by any PR.
   Every contributor's PR was red for problems they didn't cause.

Most of these live in **build/test tooling that never ships** — this app is a static Vite bundle
served by nginx with **no production Node server** (`CLAUDE.md` §Commands); a Node-side ReDoS/DoS in
a bundler or file-watcher cannot reach a user. The only real runtime one was `dompurify`. The waiver
escape valve "works," but it turns every spontaneous advisory into mandatory toil (write a dated,
mitigated waiver for something that can't reach prod) just to unblock unrelated work.

## Decision drivers

- **Stop blocking unrelated PRs** on advisories they did not introduce — the concrete, recurring pain.
- **Do not weaken detection or production coverage.** The full tree must still be audited; a vuln a PR
  actually adds must still block; `main` must still be held to the full bar.
- **Keep the waiver model** (ADR-0041) intact for genuine no-upstream-fix cases (quill, braces).
- **Smallest change**; no new runtime dependency; `CLAUDE.md` "never weaken security".

## Decision

Give the gate **two modes**, auto-selected from the environment:

- **DELTA** — on a pull request (`GITHUB_BASE_REF` is set). Fail **only** on advisories this PR
  **introduces** relative to the base branch. The base's current advisory set is computed by fetching
  the base tip shallowly and auditing its `package.json` + `package-lock.json` from `FETCH_HEAD` in a
  temp dir (`npm audit` reads the lockfile — **no install**; robust to a shallow CI checkout that never
  materialized a remote-tracking ref). Git is invoked argv-form (`execFileSync`, **never via a shell**),
  so a hostile base-ref name cannot inject a command — this is the security gate itself. Advisories are
  identified by **(package, GHSA)**, not GHSA alone, so a PR that adds a _new_ vulnerable package for an
  already-known GHSA still counts as introduced. The head's advisories are partitioned into _introduced_
  (not on base → **block**) vs _pre-existing_ (already on base → **reported, non-blocking**). Expired
  baseline waivers are likewise reported, not blocking, on a PR.
- **FULL** — on push to `main`/`master`, the weekly schedule, locally, or with `--full`. Unchanged
  ADR-0041 behavior: fail on **any** unwaived advisory **and** any expired waiver. This is where the
  baseline is kept honest and drift is burned down.

If the base cannot be resolved (fetch/show/audit error), the gate **fails closed to FULL mode** rather
than letting a PR through unchecked. No workflow change is required — the single `run:` line already
passes `GITHUB_BASE_REF` on PRs and omits it on push/schedule.

## Security model — why this is not a weakening

- **Coverage is identical.** The whole tree is still audited on every run; nothing is excluded by
  severity or dev/prod classification (the alternatives below _would_ drop real production advisories).
- **New risk still blocks.** Any advisory a PR actually introduces (a new dep, a bump that pulls a
  vulnerable transitive) is "not on base" → blocks. That is the risk a PR is responsible for.
- **The baseline is still fully gated.** `main`'s push build and the weekly schedule run FULL mode, so
  pre-existing drift is surfaced and must be fixed or waived **with human review** — it just no longer
  punishes every contributor. Enforcement is _retargeted_, not removed.
- **Waivers unchanged.** The expiring, mitigated allow-list still applies in both modes.
- **Fail-closed** on base-resolution failure preserves the strict behavior under infra glitches.

## Alternatives considered

- **Scope the blocking lane to production deps / high+critical only.** Rejected: `npm` classifies
  build chains (tailwind/postcss/bundler) as "production," so it would _still_ block on the exact
  tooling advisories that caused this drift, **and** it would stop blocking a genuine _moderate
  production_ advisory (e.g. a moderate XSS) — a real reduction in coverage. Delta keeps every severity.
- **Committed baseline file** (snapshot of known GHSAs, refreshed nightly). Rejected: a newly-published
  advisory on an unchanged dep is absent from the snapshot until the next refresh, so it would block PRs
  during that lag window — the same drift problem, time-boxed. Auditing the base **live** has no lag.
- **Audit the base by full `npm ci` + audit.** Rejected as unnecessary: `npm audit` runs from the
  lockfile alone (verified), so no install is needed.
- **Loosen or disable the gate.** Rejected outright — the anti-pattern `CLAUDE.md` forbids.

## Consequences

**Good**

- A spontaneously-published advisory on unchanged deps no longer blocks unrelated PRs — the recurring
  outage is gone.
- `main` stays honest (FULL on push + weekly), and real PR-introduced vulns still block.
- Script-only change; reversible by revert or `--full`.

**Trade-offs / honest limits**

- `main`'s dependency-advisory health is now signaled by a **red push/weekly build**, not by blocking
  every PR — **someone must watch that signal** and burn the baseline down (the waiver list + the
  weekly run are the burndown surface). This is a deliberate ownership shift, not a gap.
- The PR gate does one extra lockfile audit of the base (seconds; within the 10-min job budget).
- Fail-closed means a base-resolution glitch transiently reverts a PR to the strict full gate.

**Rollout (`release-deployment-safety`)**

- One script + its smoke test + this ADR. No workflow, schema, app-code, or runtime change; no deploy
  impact. Rollback = revert.

## Confirmation

- **Committed smoke test** (`check-dependency-advisories.smoke.test.ts`) runs the REAL guard against
  fixtures via its env seams and discriminates on every critical branch:
  - FULL (5): unwaived→1, waived→0, expired-waiver→1, clean→0, unparseable-audit→2 (fail-closed). The
    FULL cases now explicitly clear `GITHUB_BASE_REF` so a CI pull_request run can't flip them to delta.
  - DELTA (5): advisory pre-existing on base→0; advisory introduced→1; a new package carrying a GHSA
    already on base via a _different_ package→1 (pins the (package, GHSA) identity); base unresolvable
    → **fail-closed to FULL**→1; `--full`→1.
- **Security review:** `judge-arch` run in fresh context; its findings (no-shell base fetch,
  (package, GHSA) identity, fail-closed + committed coverage, ADR refs) are all applied here.
- **Real-PR exercise:** the git `FETCH_HEAD` base-audit path (not reachable via the fixture seam) runs
  for the first time on this PR's own CI; worst case is the fail-closed fallback to FULL, surfaced by a
  `⚠` line, never a silent pass.
- **Architecture gate:** `npm run check:architecture` exits 0 and `judge-arch` returns PASS.
