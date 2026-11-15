# ADR 20261110 — Every edge-function test must run in CI (and scoping RP-H honestly)

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: re-audit 2026-10-30 (RP-H: TST-2 / TST-3 / TST-4, A11Y-1, BRW-1), the
  comprehensive-test-strategy skill (an un-run test is a false green)

## Context

RP-H in the re-audit bundles four test-wiring items: (TST-2) wire the unrun Deno edge tests; (TST-3)
make pgTAP blocking; (TST-4 / A11Y-1 / BRW-1) un-manual the cross-browser / a11y / visual workflows and
add a real axe gate. Investigating each against current `main` (observed this session) showed they have
very different blockers, so this ADR ships the one that is fully verifiable here and scopes the rest
honestly rather than claiming RP-H done.

- **TST-2 (shippable, verifiable):** `deno-check` runs `deno test` over a **hand-maintained argument
  list** in `ci.yml` — **25 explicit file args plus 10 directory args** (`deno test .../foo/` runs every
  `*.test.ts` under `foo/`). Of the **72** `supabase/functions/**/*.test.ts` on disk, **45 run** (25
  explicit + 20 covered by a directory arg) and **27 are genuinely unrun** — committed but never executed,
  reading as coverage while catching nothing; and a newly-added test outside those dirs is unrun until
  someone remembers the list. (Observed: the `deno test` command block in `ci.yml` lines ~965–1000; 72
  files on disk. An earlier draft of this ADR miscounted the directory args as unrun — corrected after a
  fresh-context review.)
- **TST-3 (cannot ship blind):** `db-test` runs `supabase test db` (pgTAP) but is **informational — not
  in the `gate` aggregator** — and only on migration PRs. The ci.yml comment itself says to promote it
  "once a full green baseline is established." I **could not confirm that baseline** from here (no local
  Supabase/Docker; the db-test job is `skipped` on every run without a migration change, and its
  job-level conclusion on migration PR heads was not retrievable). Promoting it blind would risk blocking
  **every** migration PR if the suite is currently red.
- **TST-4 / A11Y-1 / BRW-1 (Held):** `a11y-audit`, `cross-browser`, and `visual-regression` are all
  PARKED to `workflow_dispatch` because they need `TF_ADMIN_EMAIL`/`TF_ADMIN_PASSWORD` secrets that were
  never migrated to the new Supabase project ("never passed, 0 green" per their own headers). Un-manualing
  them needs those secrets or a **seeded CI admin fixture** (a sub-project of its own). `axe` exists only
  inside the parked `a11y-audit`, so a real PR-level a11y gate also hinges on that fixture.

## Decision

Ship TST-2 now as a fail-closed guard; stage TST-3; leave TST-4/A11Y-1/BRW-1 as scoped follow-ups.

1. **`scripts/ci/check-deno-test-coverage.mjs`** (`ci-lane: critical`) — every `supabase/functions/**/*.test.ts`
   must be run by the ci.yml `deno test` command (named as an explicit file arg, OR under one of its
   directory args) or sit on the **shrink-only backlog** `scripts/ci/deno-test-exclusions.json`. The
   "is it run" check is scoped to the `deno test` command block(s) only — a path in a comment, a `paths:`
   filter, or the typecheck-only `deno check` step does **not** count as run. A new test in neither place
   reds the build; the backlog may only shrink (an entry whose file is gone, or that is now wired —
   including by a directory arg — must be pruned). Fails closed (exit 2) on a missing dir / missing
   ci.yml / zero tests / unreadable or `excluded`-less backlog.
2. **Backlog snapshot:** the **27** genuinely-unwired tests go on the backlog (the TST-2 burndown). This
   does not force them into CI blind (some may need env/network the runner lacks — the likely reason they
   were off the list); it stops a *new* test from silently joining them, and each is burned down by
   wiring it and confirming it passes in CI.
3. Discrimination test `src/test/smoke/check-deno-test-coverage.smoke.test.ts` (DTC-001..010) reds on
   every class (unrun-unlisted, stale-gone, stale-wired, a mention outside the `deno test` command) and
   greens a directory-arg-covered test, plus the fail-closed paths (zero tests, missing ci.yml, malformed
   backlog).

Design bar held: prevent by construction → fail-closed CI gate → a discrimination test that reds on
revert. This is the comprehensive-test-strategy tenet (no orphaned tests) enforced mechanically.

## Alternatives considered

- **Switch `deno test` to whole-tree discovery (`deno test supabase/functions/`).** Rejected for now —
  the 27 unwired tests are off the command presumably because some need env/network the CI runner lacks;
  running all blind could redden CI (I cannot run deno here to check). The guard + shrink-only backlog
  gets the same end state (every test wired) safely, by burndown.
- **Promote pgTAP (`db-test`) to blocking in this PR.** Rejected — cannot confirm the green baseline the
  codebase itself gates promotion on; promoting a possibly-red suite blocks all migration PRs. Staged.
- **Build the CI admin fixture to un-park a11y/cross-browser/visual here.** Rejected as out of scope for
  one PR — it is a sub-project (seed a Supabase auth admin for CI without the prod `TF_ADMIN_*` secrets).

## Consequences

- An edge test can no longer be added and silently never run; the backlog (27) is the visible TST-2
  burndown. Guard green on the tree (72 files: 45 run — 25 explicit + 20 via directory args — 27 backlog,
  0 silently un-run — observed).
- **Staged follow-up — promote pgTAP:** once one `db-test` run is confirmed green on a migration PR
  (needs a CI run to watch, or dashboard access), add `db-test` to the `gate` aggregator's `needs` +
  result check exactly as `deno-check` was promoted (skip-passes when migrations don't change). Small,
  well-precedented diff; held only on the green confirmation.
- **Held follow-ups — TST-4 / A11Y-1 / BRW-1:** un-park `a11y-audit` / `cross-browser` /
  `visual-regression` and add a PR-level axe gate. Needs `TF_ADMIN_*` secrets or a seeded CI admin
  fixture; owner-gated.
- **Limitation (honest):** the guard proves every test *is wired to run*, not that the 27 backlogged
  tests *pass* — that is the burndown. It reads "is it run" from the `deno test` command block only
  (explicit file args + directory args); it does not execute deno, so it trusts that a directory arg runs
  what is under it. RP-H is **partially** delivered by design — TST-2 only; TST-3 staged, the rest Held.
