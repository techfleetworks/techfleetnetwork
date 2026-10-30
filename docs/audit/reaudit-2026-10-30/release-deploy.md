# Release and Deployment Safety: Re-audit (2026-10-30)

**Dimension:** release and deployment safety (how code, edge functions and migrations reach prod).
**Code:** `C:\Users\morga\Documents\tfn-reaudit` at `e4c366190` (origin/main, 2026-10-17).
**Standard:** `release-deployment-safety/SKILL.md`, with evidence rules from `skeptical-audit/references/evidence-discipline.md`.
**Baseline:** `docs/audit/details/release-deploy.md` (2026-10-09, score 72).
**Method:** I read the source, then ran `gh` read-only queries against GitHub (run history, run logs, secret and variable names, rulesets, check runs). I also ran the expand/contract guard locally and against throwaway fixtures. I changed no code.

---

## Score: 62 / 100. Band: ADEQUATE, MATERIAL RISK (60-74). Change vs prior: -10

**Why it dropped.** Since 2026-10-09, very little about deploys has changed. `git log --since=2026-10-09` shows no edits to any `deploy-*.yml`, `verify-deploy.yml`, `main-failure-alert.yml` or `ci-alert.yml`. Two things were added: the #424 expand/contract guard and a DRAFT backup/DR runbook. Most of the drop comes from **new evidence**, not new regressions. The prior audit only read the source, so it could not tell whether the secrets were set and the workflows were live. This time I checked GitHub at runtime:

- **No deploy failure has ever paged a human.** The `DISCORD_ALERT_WEBHOOK` secret does not exist. `main-failure-alert` has **0 successes in its last 200 runs** (66 failed, 134 skipped).
- **Prod config drift has gone unfixed for 80 days.** `config-preflight` has failed **92 times in a row**. Its last success was 2026-08-09.
- **ADR-0045 auto-apply was never turned on.** `Deploy migrations` failed **10 of 10** runs because `SUPABASE_DB_PASSWORD` is not set. Migrations are **hand-applied before merge**.
- **Two frontend build paths are both live.** Cloudflare "Workers Builds" and the Actions `wrangler deploy` both deployed the same commit.

The C3 guard is real and blocks merges for the 4 patterns it checks. That is credit. But its scope is much narrower than the standard requires: 11 of 12 disconfirming probes pass through it.

### Weighted sub-scores

| # | Sub-criterion | Weight | Prior | Now | Contribution | Main reason |
|---|---|---|---|---|---|---|
| 1 | Backward-compatible migrations (expand/contract) | 25% | 80 | 80 | 20.0 | Guard added (+) but narrow (REL-4) |
| 2 | Deploy ordering (schema vs code) | 20% | 68 | 60 | 12.0 | Auto-apply dead; hand-apply pre-merge; contract inversion (REL-2, REL-3) |
| 3 | Rollback / instant revert | 20% | 78 | 70 | 14.0 | Never rehearsed; DR is a draft; two deploy paths make "which version is live" ambiguous |
| 4 | Feature flags / progressive delivery | 15% | 70 | 60 | 9.0 | Flag system has no consumers (`useFeatureFlag` has 0 call sites); no canary; 125-function big-bang edge deploys |
| 5 | Deploy observability and alerting | 15% | 62 | 35 | 5.25 | Paging path has never delivered (REL-1) |
| 6 | Build-once immutable artifact and traceability | 5% | 55 | 45 | 2.25 | Dual build observed; `npx wrangler` version not pinned |
| | **Total** | | **72** | | **62.5 → 62** | |

---

## Answer to the "hand-applied vs auto-applied" conflict

**Migrations are HAND-APPLIED to prod, before merge. The auto-apply workflow exists but has never applied anything.** State: `observed`.

| Evidence | Source (re-runnable) |
|---|---|
| Every `Deploy migrations` run in history concluded `failure` (10 of 10, 2026-09-19 to 2026-10-14) | `gh run list --workflow deploy-migrations.yml --limit 200 --json conclusion` |
| Latest run failed at the preflight step: `##[error]SUPABASE_DB_PASSWORD is not set` | `gh run view 38578874432 --log-failed` |
| No `SUPABASE_DB_PASSWORD` secret exists (repo secrets: ANTHROPIC_API_KEY, CLOUDFLARE_*, DISCORD_* bot, SUPABASE_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY, VITE_*) | `gh secret list` (2026-10-30) |
| The working process is hand-apply before merge, because `db-schema-gate` fails a PR until the new objects exist in prod | `docs/adr/0067-class-admin-unified-ia.md:84-86` ("hand-applied to prod via the Supabase SQL Editor before merge (prod has no migrations ledger)"), `docs/adr/0061-cohort-registration-status.md:99-100`, `docs/adr/0070-gumroad-reconcile-clawback.md:60`; gate code `scripts/ci/check-db-schema-present.mjs:7-14` reads ALL committed migrations on the PR branch and requires each declared object present in prod |
| `supabase/migrations/CLAUDE.md:3` ("hand-applied") is **correct**. `docs/adr/0045-auto-apply-migrations-on-merge.md` (Status: Accepted), the `deploy-migrations.yml:3-19` header and `docs/architecture/audit-2026-08/migration-auto-apply.md:42-46` ("Prod can no longer silently fall behind main") describe a state that was never reached | files as cited |

Limitation: I cannot see whether the one-time ledger bootstrap was ever done. Its absence is `documented` (ADR-0067:85, dated 2026-10-09), not observed.

---

## Deploy-path map

| Artifact | Trigger | Ordering | Pre-prod verification | Post-deploy verification | Rollback | Paging on failure |
|---|---|---|---|---|---|---|
| **DB migrations** | **Human** applies via SQL Editor or local `supabase db push`, **before merge**. `deploy-migrations.yml` also fires on push to `main` touching `supabase/migrations/**`, but always fails at preflight (`deploy-migrations.yml:65-80`) | Additive objects: migration-before-code is **mechanically forced**, because `db-schema-gate` (`ci.yml:658-677`, required via `gate`) fails until prod has the object. Contract (drop/rename): **not ordered**. See REL-3 | `migration-smoke` (fresh `db reset`, `ci.yml:581-639`); `check-migration-expand-contract` (critical lane → `gate`); `db-schema-gate` | `db-schema-gate` on the next schema PR; daily `config-preflight` (red for 80 days) | Forward-only compensating migration (`docs/runbooks/rollback.md`); PITR unverified (`docs/runbooks/backup-and-dr.md:20`, "VERIFY IN PROD") | **None.** "Deploy migrations" is not in the watch list (`main-failure-alert.yml:16`), and the alert job cannot deliver anyway (REL-1) |
| **Edge functions (125)** | Push to `main` touching `supabase/functions/**` or `supabase/config.toml` (`deploy-edge-functions.yml:38-49`) | Runs in parallel with frontend; no `needs`/`workflow_run` chain. A `_shared/` change redeploys **all** functions at once (`:129-133`) | `deno-check` (conditional, required via `gate`) | Gateway root must not be 503 (`:239-252`). This does not check the deployed version or any real call. Cron `edge-deploy-smoke` checks presence | `git revert` + redeploy, or `workflow_dispatch deploy_all`; no stored artifacts | Watched by name, but **partial failure is green** (`:228-233`), and alert delivery is broken (REL-1) |
| **Frontend (SPA)** | Push to `main` (paths-ignore `supabase/**`, docs, md). **Two paths fire:** (a) Actions `deploy-frontend.yml` `npx wrangler deploy` + force 100% (`:76-96`); (b) Cloudflare **Workers Builds** git integration | No ordering between (a) and (b), or vs edge/migrations | CI `gate` (build, unit, e2e vs local Supabase); no staging | Per-commit marker `/deploys/<sha>.txt` polled in-job (`deploy-frontend.yml:98-121`) and by `verify-deploy.yml:48-71`. Observed working: `attempt 1: 'e4c36619…'` ✅ (run 39055431116) | Cloudflare dashboard "Rollback to this deployment" (`rollback.md:14-16`) or `git revert`; never rehearsed, no recorded time | "Deploy frontend" and "Verify deploy" are **not** in the watch list; delivery is broken anyway |
| **Config / secrets / cron (prod)** | Out of band (dashboard, `supabase secrets set`) | n/a | none | Daily `config-preflight` → `environment_readiness()` | Manual | Watched, but undeliverable. Red since 2026-08-09 |
| **Feature behavior** | `public.feature_flags` admin flip (no deploy) | n/a | flag unit tests (client + edge golden vector) | none | Flip `enabled=false` | n/a. Only one flag (`logger_error_reporting`) exists and is consumed |

---

## Findings

Evidence states follow the contract: `proven` / `observed` / `inferred` / `documented` / `reported` / `not-assessed`.

### REL-1: No deploy or drift failure has ever reached a human. HIGH

- **Where:** `.github/workflows/main-failure-alert.yml:16` (watch list), `:31,39-42` (webhook required, fails if absent); `.github/workflows/ci-alert.yml:12-15` (watches non-existent "Regression").
- **What:**
  - `DISCORD_ALERT_WEBHOOK` is not a repo secret. Every failure on `main` makes `main-failure-alert` fail with `##[error]DISCORD_ALERT_WEBHOOK secret is not set`, which nobody watches.
  - Last 200 runs: 66 failure, 134 skipped, **0 success**.
  - The `config-preflight` it relays has failed **92 consecutive daily runs** (last success 2026-08-09). Today's run shows live prod drift: `missing cron_job self_healing_health_eval`, `missing cron_job self_healing_remediations`, `missing cron_job triage-critical-push`, `error vault_secret email_queue_service_role_key.role role=not_a_jwt`, `error cron_job prewarm-ugc-worker-every-30s stale`.
  - The watch list still omits "Deploy migrations", "Deploy frontend (Cloudflare)" and "Verify deploy". This is unchanged from the prior audit.
  - `ci-alert` watches "Regression" (no such workflow; `ci.yml:3`), so it was skipped on 30 of 30 recent runs.
- **Why it matters:** the skill requires every change to be "observable while it rolls out". Failed migration applies, stale frontends and DB drift all fail silently. The 80-day-old cron and vault drift is the proof.
- **Evidence state:** `observed`.
- **Re-runnable:** `gh secret list`; `gh run list --workflow main-failure-alert.yml --limit 200 --json conclusion`; `gh run view 41065751394 --log-failed`; `gh run list --workflow config-preflight.yml --limit 120`; `gh run view 41065706252 --log-failed`.
- **Limitation:** GitHub's built-in "workflow failed" emails may reach whoever triggered a run or last edited a cron (`not-assessed`). The 80 days of unfixed drift suggest nobody acts on them.
- **Disconfirming case first:** I looked for a second working channel. `ci-alert.yml` posts via `discord-notify`, but its triggers never match. `incident-gate` is green (30 of 30) but is a scheduled gate, not a pager. No second channel was found.
- **Smallest fix:**
  1. **Prevent by construction (no prod access):** add a second delivery channel that needs no extra secret. Open or update a GitHub issue labeled `prod-alert` using `GITHUB_TOKEN` (`issues: write`), so a missing webhook can never mean silence. Derive the watch list instead of hand-maintaining it: any workflow whose name starts with `Deploy`, plus `Verify deploy` and `Config preflight`. Fix `ci-alert` to watch `CI`, or delete it.
  2. **Fail-closed gate:** a CI guard that parses every `deploy-*.yml` / `verify-*.yml` `name:` and fails if it is missing from the `main-failure-alert` `workflows:` list.
  3. **Discrimination test:** remove "Deploy migrations" from the list in a fixture and assert the guard exits 1.
  4. **Needs prod/admin access:** add `DISCORD_ALERT_WEBHOOK`; fix the 5 readiness rows.

### REL-2: ADR-0045 auto-apply is documented as live but has never run. Prod has no ledger. Turning it on would replay all 730 migrations. HIGH

- **Where:** `.github/workflows/deploy-migrations.yml:65-80` (preflight checks secrets only), `:120-132` (dry-run is informational, then `db push`); `docs/adr/0045-auto-apply-migrations-on-merge.md:3` (Accepted).
- **What:**
  - (a) Doc/reality drift: the ADR, the workflow header and the activation runbook say prod "can no longer silently fall behind main". In reality, every run fails and migrations are hand-pasted in the SQL Editor before merge. That process leaves no record of who applied what, or when.
  - (b) A latent hazard: the preflight checks only that the secrets exist. It does not check that the ledger is bootstrapped. ADR-0067:85 (2026-10-09) says "prod has no migrations ledger". If someone adds `SUPABASE_DB_PASSWORD` without running the one-time `bootstrap-ledger`, the next migration merge runs `supabase db push` against an empty ledger. It would try to apply every migration in the repo (730 files) to prod. The dry-run on `:120-125` prints the list but nothing stops on it.
  - (c) A permanently red workflow on every migration merge teaches people to ignore red.
- **Evidence state:**
  - (a) `observed`: 10 of 10 failures, `gh run view 38578874432 --log-failed`, `gh secret list`.
  - (b) `inferred`: from the observed preflight code, the documented no-ledger state, and the documented `db push` semantics in the workflow's own comment (`:15-16`, "applies ONLY migrations the remote ledger has not seen").
- **Limitation:** I cannot query prod for `supabase_migrations.schema_migrations`. If the ledger exists and is current, (b) drops to Low.
- **Disconfirming case first:** I looked for any successful apply or any ledger-bootstrap run. None exists in the 10-run history (`gh run list --workflow deploy-migrations.yml --limit 200`).
- **Smallest fix:**
  1. **Prevent by construction (no prod access):** in `deploy-migrations.yml`, before `db push`, run `supabase migration list` (or the dry-run) and **fail closed** if the pending set is not exactly the migrations added in `github.event.before..github.sha`. That one check blocks both the replay-everything case and the out-of-band drift case.
  2. Or decide formally to stay hand-apply: supersede ADR-0045, remove the push trigger, and fix the three docs.
  3. **Discrimination test:** a fixture with 3 pending migrations of which only 1 is in the diff must make the step exit non-zero.
  4. **Needs prod access:** bootstrap the ledger, then add the secret.

### REL-3: Hand-apply-before-merge reverses expand/contract ordering for contract migrations. MEDIUM

- **Where:** process in `docs/adr/0067-class-admin-unified-ia.md:84-86` and `docs/adr/0061-cohort-registration-status.md:99-100`; gate in `scripts/ci/check-db-schema-present.mjs:20-34` (declared = created − dropped; presence only); annotation scope in `scripts/ci/check-migration-expand-contract.mjs:86,100`.
- **What:** the gate forces prod to be changed before merge. That is the right order for expand. For contract it is the wrong order: a DROP/RENAME applied before merge goes live against the code currently in prod, which still uses the old shape. The `-- expand-contract-ok:` annotation lets a contract migration ship in the **same PR** as the code that stops using the column. Nothing requires the contract to come in a later PR, after the code that stopped using the old shape is verified live.
- **Evidence state:** `inferred` (from the documented process plus observed gate code). No incident observed. Since September, only one contract-style migration landed (`20260913120000_retire_framework_overview.sql`), and it dropped objects already absent from prod.
- **Limitation:** frequency is low today, which is why this is Medium, not High.
- **Smallest fix:**
  1. **Prevent:** the annotation must name a merged PR or commit SHA that removed the last reader (`-- expand-contract-ok: readers-removed-in <sha>: <reason>`).
  2. **Gate:** verify that the SHA is an ancestor of `origin/main` and is **not** part of this PR.
  3. **Test:** an annotation citing a commit inside the PR exits 1.

### REL-4: The expand/contract guard is wired and blocking, but covers 4 of the roughly 11 unsafe patterns the standard names. Annotations exempt the whole file. The grandfather list is not actually shrink-only. HIGH

- **Where:** `scripts/ci/check-migration-expand-contract.mjs:50-55` (4 patterns, single-line), `:86` (the annotation anywhere exempts every hit in the file), `:104-114` (only *stale* entries are checked, so a new entry passes).
- **Credit:**
  - The guard has `// ci-lane: critical`, so it runs in `lint-arch-critical`, which feeds `gate` (`ci.yml:417,451`). `gate` is required by the active ruleset `main-security-gates` (`gh api repos/techfleetworks/techfleetnetwork/rulesets/23181685`).
  - The discriminating test `src/test/smoke/check-migration-expand-contract.smoke.test.ts` (EC-001..EC-009) is inside the vitest include (`vitest.config.ts:17`). It fails closed on a missing or empty dir (exit 2).
  - Run on the real repo: `✓ … 730 migrations scanned; 4 grandfathered` (exit 0).
  - So for DROP COLUMN, RENAME COLUMN, single-line ALTER … TYPE and SET NOT NULL, the guard is **`proven`**.
- **Gap.** Disconfirming probes, each a fresh fixture with an empty allowlist and run with `node scripts/ci/check-migration-expand-contract.mjs` (exit code shown):

  | Probe | SQL | Exit | Should be |
  |---|---|---|---|
  | P1 | `DROP TABLE public.orders;` | 0 | 1 |
  | P2 | `ALTER TABLE public.orders RENAME TO purchases;` | 0 | 1 |
  | P3 | `ALTER TABLE t` ⏎ `ALTER COLUMN c` ⏎ `TYPE bigint;` (multi-line) | 0 | 1 |
  | P4 | `ADD COLUMN c text NOT NULL` (no default) | 0 | 1 |
  | P5 | `DROP FUNCTION public.get_profile(uuid);` | 0 | 1 |
  | P6 | `TRUNCATE public.audit_log;` | 0 | 1 |
  | P7 | `CREATE INDEX` without `CONCURRENTLY` | 0 | 1 (lock) |
  | P8 | `ADD CONSTRAINT … FOREIGN KEY` without `NOT VALID` | 0 | 1 (lock) |
  | P9 | annotation on line 1, unrelated `DROP COLUMN` on line 3 | 0 | 1 |
  | P10 (control) | `DROP COLUMN y` | **1** | 1 |
  | P11 | `DROP FUNCTION` + signature-changing `CREATE OR REPLACE` | 0 | 1 |
  | P12 | new destructive file **added** to the grandfather list | 0 | 1 |

- **Why it matters:** `deploy-migrations.yml:13-14` and ADR-0045 call the expand/contract convention the reason it is "safe to auto-apply". `supabase/migrations/CLAUDE.md` forbids dropping a called function in place, but the guard cannot see that. And `db-schema-gate` does not catch drops, because a dropped object leaves the declared set.
- **Evidence state:** `observed` (probe script `…\scratchpad\probe.ps1`, outputs above).
- **Limitation:** I did not measure how many *historical* migrations would trip the wider patterns. There are about 42 DROP TABLE/FUNCTION/TRUNCATE/RENAME TO hits across 28 files (Grep), so the grandfather list will grow at rollout.
- **Disconfirming case first:** P10 exits 1, which shows the harness works and the misses are real. I also checked for another gate that catches P1/P2/P5 (`migration-smoke` only proves the migration applies; `db-schema-gate` is presence only). Neither catches them.
- **Smallest fix (no prod access):**
  1. Extend the pattern set to the skill's `check-migration-safety.mjs` rule list.
  2. Match per **statement**: split on `;` using the existing `_sql-scan.mjs` `codeView` so comments, strings and multi-line forms are handled.
  3. Make the annotation per statement (the comment must sit on or directly above the hit).
  4. Pin the grandfather **count** in the script so any growth exits 1.
  5. Add EC tests for P1-P9, P11 and P12, each asserting exit 1.

### REL-5: Two independent frontend builds deploy every commit. The deploy tool version is not pinned. MEDIUM

- **Where:** `.github/workflows/deploy-frontend.yml:66-96`; `CLAUDE.md` Commands ("Cloudflare Pages git integration… no GitHub Actions deploy step"); `ci.yml:15-16`.
- **What:**
  - On `e4c366190`, both a `Workers Builds: techfleetnetwork` check run (app `cloudflare-workers-and-pages`, success) **and** the Actions `wrangler deploy` (run 39055431116, which forced version `621e9f25…` to 100%) ran.
  - That is two separately built artifacts racing for the same Worker, which breaks build-once-promote.
  - `wrangler` is not in `package.json`, so `npx` downloads whatever version is current at run time (log: `will be installed: wrangler@4.151.1`).
  - The ruleset does not require "Workers Builds", even though `ci.yml:15-16` says branch protection does.
- **Evidence state:** `observed` (`gh api …/commits/e4c3661…/check-runs?page=1..3`; `gh run view 39055431116 --log`; Grep of `package.json`).
- **Limitation:** I cannot see which build "won" on a given commit. The marker check confirms that the SHA is served, not which build served it.
- **Disconfirming case first:** I checked whether the deploy workflow is still a no-op, as the prior audit suspected. It is not: the token is set and the deploy happened.
- **Smallest fix:**
  1. Pin `wrangler` in devDependencies and call `npx --no-install wrangler`. This can be done in the repo.
  2. Disconnect the Cloudflare git integration (needs Cloudflare dashboard access).
  3. Correct `CLAUDE.md`, `rollback.md:8-16` and `verify-deploy.yml:70` so they all describe the wrangler path.

### REL-6: A partially failed edge deploy is green, and the post-deploy smoke does not test the deployed code. MEDIUM

- **Where:** `deploy-edge-functions.yml:211-233` (only fails if 0 of N succeeded), `:160` (`steps.guard.outputs.skip` is never set, so the condition is dead), `:239-252` (smoke checks only that the gateway root is not 503).
- **What:**
  - If 124 of 125 functions deploy, the run is green, so nothing pages and the next push does not retry. Change detection only diffs `before..after`, so a missed function stays stale until someone touches it.
  - Any `_shared/` change redeploys all 125 functions at once, with no canary.
  - Observed: 30 of 30 recent runs fully succeeded (e.g. `Attempted: 125 · Deployed OK: 125`), so this is latent.
- **Evidence state:** `observed` (code plus 30-run log scan, script `…\scratchpad\edge.ps1`).
- **Limitation:** I did not test a real partial failure.
- **Smallest fix (repo only):**
  1. Exit 1 when `failed` is non-empty, after the loop, so all functions are still attempted.
  2. Smoke-call one known `verify_jwt=false` health function and compare a build SHA it returns.
  3. **Test:** a dry-run fixture with one forced failure must make the step exit 1.

### REL-7: No staging and no canary. Every deploy goes 100% straight to prod. MEDIUM (unchanged)

- **What:** commit → CI (e2e against an ephemeral local Supabase) → 100% prod. Repo variables `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PROJECT_ID` and `STAGING_SUPABASE_PUBLISHABLE_KEY` (project `iqsjhrhsjlgjiaedzmtz`, created 2026-06-26) exist, but **no workflow references them** (Grep `STAGING_` in `.github/` returns 0 hits). The only GitHub environment is `github-pages`.
- **Evidence state:** `observed` (`gh variable list`, `gh api …/environments`, Grep).
- **Limitation:** I did not check whether the staging project is alive.
- **Fix:** for an app of this size, a staging *migration* rehearsal gives the most value: run `supabase db push` against the staging project as a required pre-merge job on migration PRs. That also replaces SQL-Editor hand-apply as the first place a migration runs. Needs the staging DB password.

### REL-8: Feature-flag system exists but is essentially unused, so deploy equals release. MEDIUM

- **What:**
  - `useFeatureFlag` (`src/hooks/use-feature-flag.ts:10`) has **zero call sites**.
  - The edge `flagEnabled` (`supabase/functions/_shared/feature-flags.ts:41`) is called only from its test.
  - The only seeded flag is `logger_error_reporting` (`20260827120000_feature_flags.sql:38-41`), consumed by `src/lib/observability/logger-report-bridge.ts`.
  - There is still no owner or expiry field and no stale-flag sweep (prior REL-7).
  - Kill switches that do exist are env-based (`FLEETY_BRAINTRUST_ENABLED`).
- **Evidence state:** `observed` (Grep `useFeatureFlag\(|flagEnabled\(` across `src` and `supabase/functions`).
- **Limitation:** features gated by other mechanisms, such as role checks or the env kill switches, are not counted.
- **Fix:**
  1. Require new user-visible flows to ship behind a flag, enforced by review or a judge-arch rule.
  2. Add `owner` and `expires_at` columns via an expand migration.
  3. Add a CI sweep that fails on expired flags.

### REL-9: Rollback and restore never rehearsed; DR plan is a draft. MEDIUM

- **What:** `docs/runbooks/backup-and-dr.md:3-7` is a "DRAFT", with every restore-test step marked "⬜" and PITR availability "⬜ VERIFY IN PROD" (`:20`). There is no measured RTO and no recorded rollback time for the frontend, edge or DB. The skill requires the "reversible within minutes" claim to be at `observed`. It is at `documented`.
- **Evidence state:** `documented`.
- **Fix:** needs prod access. Run the quarterly drill once, record the time, and add a `workflow_dispatch` "rollback rehearsal" that redeploys the previous Worker version and times the marker flip.

### REL-10: Docs and enforcement claims drift from reality. LOW

- `docs/audit/skill-to-gate-coverage-matrix-2026-10.md:105,150` cites `check-migration-safety.mjs`, which does not exist. Only `check-migration-expand-contract.mjs` and `check-migration-version-collision.mjs` exist.
- `ci.yml:15-16` claims branch protection requires "Workers Builds". Classic protection has `contexts: []`. The active ruleset requires `CodeQL, dependency-advisories, secret-scan, dependency-review, gate, stryker`.
- `CLAUDE.md` and `rollback.md` describe Pages git integration only.
- The migration-auto-apply docs: see REL-2.
- **Evidence state:** `observed` (`gh api …/branches/main/protection`, `…/rulesets/23181685`, Glob).
- **Fix:** correct the docs. Optionally, add a guard that every `scripts/ci/*.mjs` named in `docs/audit/*matrix*.md` exists.

### REL-11: No deploy record; no batched backfill harness. LOW (unchanged)

- No step records which migrations, flags or functions changed per deploy. With the SQL Editor hand-apply, the migration record is lost entirely.
- Backfill harness: `not-assessed` this round (prior: inferred absent).

---

## Prior findings status

| Prior | Status now | Evidence |
|---|---|---|
| REL-1 CRITICAL: expand/contract convention-only | **Partially fixed.** Guard #424 is wired, blocks merges (critical lane → `gate` → ruleset) and has a discrimination test, but only for 4 single-line column patterns. Now REL-4 (High) | observed / proven for 4 patterns |
| REL-1 sub-question: is deploy ORDERING enforced? | **Additive objects: yes**, mechanically, via `db-schema-gate` presence (it forces prod-first, by hand). **Contract: no** (REL-3). **Cross-workflow (frontend vs edge vs migration): no** `needs` chaining, unchanged | observed (code) |
| REL-2 HIGH: paging omits migration/verify/frontend | **Not fixed and worse than understood.** Watch list unchanged, and the webhook secret is absent, so **nothing** pages (REL-1) | observed |
| REL-3 HIGH: no staging / 100% cutover | **Not fixed** (REL-7). Staging vars exist but are unused | observed |
| REL-4 MED: dual frontend path | **Confirmed live** (REL-5) | observed |
| REL-5 MED: no backup/RPO/RTO | **Partial.** Draft runbook with proposed targets (`backup-and-dr.md`), nothing verified (REL-9) | documented |
| REL-6 MED: schema-gate vs auto-apply chicken-and-egg | **Resolved as a question.** It is real; the team works around it by hand-applying before merge, and auto-apply was never activated (REL-2) | observed |
| REL-7 LOW: flag hygiene | **Not fixed**, and flags are effectively unused (REL-8) | observed |
| REL-8 LOW: backfill harness | not re-assessed | not-assessed |

---

## Evidence ledger (load-bearing claims)

| Claim (falsifiable) | State | Source (re-runnable) | Limitation |
|---|---|---|---|
| Migrations reach prod by hand, not via `deploy-migrations.yml` | observed | `gh run list --workflow deploy-migrations.yml` (10/10 failure); `gh run view 38578874432 --log-failed`; `gh secret list` | Ledger existence not queried |
| No failure on `main` has paged a human in the last 200 alert runs | observed | `gh run list --workflow main-failure-alert.yml --limit 200` (0 success) | GitHub email notifications not assessed |
| Prod config drift has gone unfixed since 2026-08-09 | observed | `gh run list --workflow config-preflight.yml --limit 120`; run 41065706252 log rows | The rows come from `environment_readiness()`; I did not verify each row's impact |
| Expand/contract guard blocks DROP/RENAME COLUMN and is proven | proven (for those patterns) | `node scripts/ci/check-migration-expand-contract.mjs` exit 0 on repo; P10 exit 1; EC-001..009; ruleset requires `gate` | Proven only for its 4 patterns |
| The guard misses DROP TABLE, RENAME TO, DROP FUNCTION, multi-line TYPE, NOT NULL add, lock-taking DDL, misplaced annotation, grandfather growth | observed | probe.ps1, P1-P9, P11, P12 exit 0 | Fixture-based |
| Additive migration-before-code ordering is mechanically forced | observed (code) / documented (practice) | `check-db-schema-present.mjs:7-34`; `ci.yml:458-461`; ADR-0061/0067 | Contract ordering not enforced |
| Two frontend builds deploy the same commit | observed | check-runs on `e4c3661` (cloudflare-workers-and-pages: 1); run 39055431116 log | Cannot see which build served traffic |
| Frontend deploy is verified to serve the merged SHA | observed | run 39055431116: `attempt 1: 'e4c36619…' ✅` | Verifies SHA, not app health |
| Edge partial failure would be green | observed (code) | `deploy-edge-functions.yml:228-233` | No real partial failure seen in 30 runs |
| Rollback within minutes | documented | `rollback.md:14-16` | Never rehearsed; below `observed`, so no "safe to ship" verdict is possible |

**Conformance vs adequacy.** The repo now conforms to "a mechanical expand/contract gate exists". It is not adequate: the gate misses the table, function and lock classes, and the paging the delivery story relies on has never delivered.

## Coverage

- **Read:** all 4 deploy/verify workflows, both alert workflows, `ci.yml` gate/migration/schema jobs, the expand/contract guard and its test, the `db-schema-gate` header, the auto-apply runbook, ADR-0045 and the ADR-0061/0067/0070 deploy notes, `migrations/CLAUDE.md`, `rollback.md` (frontend section), `backup-and-dr.md`, the feature-flag sources (by grep).
- **Runtime (read-only gh):** run histories for 8 workflows, 5 failure logs, a 30-run edge-deploy log scan, secret and variable names, classic protection, rulesets, environments, check runs on HEAD.
- **Executed locally:** the guard on the real repo plus 12 fixture probes.

## Limitations

- I had no prod DB or Cloudflare dashboard access. Ledger state, PITR tier, which frontend build serves traffic, and the staging project's health are not assessed.
- The ruleset `bypass_actors` came back `[]`. That may reflect token visibility rather than truth.
- HEAD is `e4c366190` (2026-10-17). Anything merged after that is out of scope.
- I did not read every migration body. Historical exposure to the wider unsafe-pattern set is estimated by grep only.
