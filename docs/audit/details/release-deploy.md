# Release & Deployment Safety Audit — TechFleet Network

**Auditor dimension:** Release & deployment safety (zero-downtime deploys, progressive delivery,
feature flags, instant rollback, expand/contract migrations, deploy ordering). Audit scoped to
this dimension only.
**Code (read-only):** `C:/Users/morga/Documents/tfn-audit` · **Date:** 2026-10-09
**Standard:** `release-deployment-safety/SKILL.md` + 5 references.
**Posture:** skeptical release engineer. Every claim carries Evidence (file:line) · Evidence state · limitation.

---

## Score: 72 / 100 — Band: ADEQUATE, MATERIAL RISK (60–74)

This is a far more mature delivery setup than a ~767-user Lovable-origin app usually has:
auto-applied migrations with a schema-reconciliation gate, a real feature-flag kill-switch
system, a cache-proof stale-deploy verifier, and a written rollback runbook. It loses points
because the strongest safety property (expand/contract backward-compatibility) is enforced by
**convention + reviewer only, not mechanically**; deploys go straight to prod with **no staging**
and **three parallel, unordered deploy workflows**; and the loud-paging built after the 11-day
freeze **does not watch the migration-apply or stale-frontend workflows**.

### Weighted sub-scores

| # | Sub-criterion | Weight | Score | Contribution |
|---|---|---|---|---|
| 1 | Backward-compatible DB migrations (expand/contract) | 25% | 80 | 20.0 |
| 2 | Deploy ordering & atomicity (schema vs code) | 20% | 68 | 13.6 |
| 3 | Rollback / instant revert | 20% | 78 | 15.6 |
| 4 | Feature flags / progressive delivery | 15% | 70 | 10.5 |
| 5 | Deploy observability & failure alerting | 15% | 62 | 9.3 |
| 6 | Build-once immutable artifact & traceability | 5% | 55 | 2.75 |
| | **Weighted total** | | | **≈ 72** |

---

## 1 · Backward-compatible DB migrations (expand/contract) — 80/100

**Strengths (credit earned):**
- Expand/contract is a first-class, documented standard with ❌/✅ code examples.
  Evidence: `decisions.md:367-384` (§7), `supabase/migrations/CLAUDE.md` (full rule set:
  never rename/drop/type-change/NOT-NULL in place; add-new → backfill → dual-write → contract
  later; idempotent via `IF NOT EXISTS`/`CREATE OR REPLACE`). Re-runnable: open both files.
  State: VERIFIED.
- ADR-0026 (expand/contract convention) + ADR-0036 (schema-reconciliation gate) exist.
  Evidence: `docs/adr/0026-expand-contract-migration-convention.md`,
  `docs/adr/0036-comprehensive-schema-reconciliation-gate.md`. State: VERIFIED (files present).
- `migration-smoke` is **blocking** and proves every migration applies cleanly from scratch on a
  fresh Postgres (`supabase db reset --no-seed`). Evidence: `.github/workflows/ci.yml:522-580`,
  aggregated as required in `ci.yml:397-398`. State: VERIFIED.
- Migration-version-collision guard blocks two migrations sharing a version prefix (a real
  recurring break). Evidence: `ci.yml:183-184`, `scripts/ci/check-migration-version-collision.mjs`.
  State: VERIFIED (wired).
- The seeded feature_flags migration is a textbook expand: `CREATE TABLE IF NOT EXISTS`, flags
  seeded `enabled=false, rollout_percent=0`, comment: "Merging this migration changes NOTHING at
  runtime until an admin ramps." Evidence: `supabase/migrations/20260827120000_feature_flags.sql:12-41`.
  State: VERIFIED.

**Gaps:**
- **Expand/contract is NOT mechanically enforced** (see Finding REL-1, CRITICAL). `migration-smoke`
  proves *applies-from-scratch*, not *backward-compatible with running old code*. `db-schema-gate`
  explicitly owns object **PRESENCE** and by its own docs does NOT cover "in-place ALTERs, DROP-only,
  data backfills, privilege state." Evidence: `scripts/ci/check-db-schema-present.mjs:32-34`.
  So a `RENAME COLUMN`/`DROP COLUMN`/in-place type change in an expand migration passes every gate.
- **No down-migrations / forward-only.** Acknowledged and mitigated by expand/contract.
  Evidence: `docs/runbooks/rollback.md:56-64` ("There is no automatic down-migration").
  State: VERIFIED. Limitation: safe only if expand/contract was actually followed.
- **No batched/resumable backfill tooling.** The skill requires large backfills to be batched,
  idempotent, resumable, throttled, run as a background job — not in the deploy step. No such
  harness found. Evidence: absence across `supabase/migrations/` + `scripts/`. State: INFERRED
  (negative). Limitation: did not exhaustively read all ~N migration bodies; a one-shot `UPDATE ...`
  over a large table would not be caught by any gate.

---

## 2 · Deploy ordering & atomicity (schema vs code) — 68/100

**Strengths:**
- Migrations are now **auto-applied on merge** (`supabase db push`), closing the "remember to run
  the SQL by hand" hole that caused the Discord PGRST202 and feature_flags outages.
  Evidence: `.github/workflows/deploy-migrations.yml:1-132` (ADR-0045). `db push` applies only
  unseen migrations in version order, never a reset (`deploy-migrations.yml:16-18`).
  Serialized via `concurrency: deploy-migrations` (`:47-49`). State: VERIFIED.
- `db-schema-gate` (ADR-0036) fails a PR **closed** if any declared schema object is absent from
  prod, queried live via the Management API. This is a genuine detector of the
  committed-but-never-applied class. Evidence: `ci.yml:599-618`, `check-db-schema-present.mjs:27-31`
  (fail-closed enumeration). State: VERIFIED (logic present). Limitation: can't verify the live
  token/secret is configured from source.
- Dynamic-DDL tripwire: any `EXECUTE format('...%I...')` create must be registered in a reviewed
  sidecar or the gate fails closed. Evidence: `check-db-schema-present.mjs:22-26`. State: VERIFIED.

**Gaps:**
- **Three deploy workflows fire in parallel on one push, with no cross-workflow ordering.** A merge
  touching `supabase/migrations/` + `src/` triggers `deploy-migrations`, `deploy-frontend` /
  Cloudflare Workers Builds, and (if functions changed) `deploy-edge-functions` concurrently.
  Nothing guarantees the migration applies before the dependent code goes live; the Cloudflare build
  can win the race. Evidence: `deploy-migrations.yml:30-34` vs `deploy-frontend.yml:21-28` vs
  `deploy-edge-functions.yml:38-44` (independent `on.push` triggers, no `needs`/`workflow_run`
  chaining between them). State: VERIFIED. The ONLY thing protecting the mixed window is the
  expand/contract convention — which is not mechanically enforced (REL-1).
- **No staging environment.** Pipeline is commit → CI → prod. e2e runs against an **ephemeral local**
  Supabase, never a prod-shaped staging. Evidence: `ci.yml:681-798` (local Docker Supabase per shard),
  `CLAUDE.md` Commands ("push to main → Cloudflare Pages deploys automatically"). State: VERIFIED.
  The skill's dev→staging→prod gated promotion does not exist; there is no canary bake against real
  traffic before 100%.
- **db-schema-gate creates a chicken-and-egg ordering tension.** For a *net-new* migration the
  declared objects are not in prod at PR time, so the gate would fail until the migration is already
  applied to prod — implying manual pre-apply before merge — yet `deploy-migrations.yml` applies
  *post-merge*. Evidence: gate semantics `check-db-schema-present.mjs:8-14` vs post-merge applier
  `deploy-migrations.yml:127-132`. State: INFERRED (did not trace the full enumerate/merge-base
  behavior). Limitation: resolve by reading how the gate scopes "declared" on PR branches; this is a
  real workflow friction worth the team confirming.

---

## 3 · Rollback / instant revert — 78/100

**Strengths:**
- A written, pressure-ready rollback runbook covering all five surfaces. Evidence:
  `docs/runbooks/rollback.md:1-76`. Frontend: Cloudflare dashboard "Rollback to this deployment"
  (seconds, no git) + durable `git revert`. Edge: per-function revert via change-detection, full
  redeploy via `workflow_dispatch deploy_all=true`, or direct `supabase functions deploy`. Auth hook:
  instant dashboard disable → GoTrue built-in sender. Migrations: compensating forward migration.
  Deps: realign + hotfix. State: VERIFIED.
- Frontend deploy **forces the new version to 100% traffic** to defeat Cloudflare Gradual Deployments
  parking a version at 0% (the custom domain then serving stale). Thoughtful, non-obvious failure mode
  handled. Evidence: `deploy-frontend.yml:76-96`. State: VERIFIED.
- Edge deploy has a **post-deploy smoke** (gateway-up check; 503 fails the job). Evidence:
  `deploy-edge-functions.yml:239-252`. State: VERIFIED.
- Kill-switches give sub-second rollback for flagged behavior and Braintrust egress
  (`FLEETY_BRAINTRUST_ENABLED=0`, no redeploy). Evidence: `deploy-edge-functions.yml:29-33`. State: VERIFIED.

**Gaps:**
- **Rollback is manual, not automated.** No canary auto-rollback on error-budget burn; the fast path
  is a human clicking the Cloudflare dashboard. Evidence: `rollback.md:14-16`. State: VERIFIED.
  Acceptable for this scale but counts against the skill's "auto-rollback if error budget burns."
- **No backup-before-destructive-migration gate** and **no tested-restore / RPO / RTO** defined.
  The skill requires a point-in-time backup immediately before any destructive step and periodic
  restore drills. None found. Evidence: absence in `rollback.md` + `supabase/migrations/CLAUDE.md`
  (Supabase PITR may exist at the platform tier but is unverified from source). State: INFERRED.
- **DB rollback is forward-only** — unsafe-to-revert after a contract migration, mitigated only by
  "never contract until new code proven." Evidence: `rollback.md:56-64`. State: VERIFIED.

---

## 4 · Feature flags / progressive delivery — 70/100

**Strengths (genuinely good):**
- A real `public.feature_flags` table: `enabled` kill-switch + `rollout_percent` (0–100) dial,
  admin-only writer via RLS (single owner), admin-flippable **without a deploy**. Evidence:
  `supabase/migrations/20260827120000_feature_flags.sql:12-34` (ADR-0021). State: VERIFIED.
- **Safe-default-OFF on both sides** — a missing flag, unloaded snapshot, or failed fetch resolves
  to `false`, so a flag can only *enable* new behavior, never break. Evidence client:
  `src/services/feature-flags.service.ts:9-11,72` ; edge: `supabase/functions/_shared/feature-flags.ts:52-58`.
  State: VERIFIED. This matches the skill's "default to off/safe when the flag service is unreachable."
- **Deterministic cohort bucketing (FNV-1a/32) with a golden vector pinned on both client and edge**
  so the two implementations cannot silently drift. Evidence: `feature-flags.service.ts:45-52` +
  `_shared/feature-flags.ts:30-38,11` (comment: "Both suites pin the same golden vector").
  Tests: `src/test/services/feature-flags.service.test.ts`, `supabase/functions/_shared/feature-flags.test.ts`.
  State: VERIFIED.
- Transient-retry around the flag fetch so a PGRST002/503 schema-cache reload doesn't drop to the
  safe default unnecessarily. Evidence: `feature-flags.service.ts:21-24`. State: VERIFIED.

**Gaps:**
- **No progressive delivery of the running bundle itself.** The frontend ships all-or-nothing to
  100% traffic (`deploy-frontend.yml:76-96`); there is no 1%→10%→50% canary of the app with
  automated canary analysis. Feature flags cover *behavior* ramp but not *deploy* ramp. State: VERIFIED.
- **No flag registry / expiry / cleanup automation.** The skill requires every flag to have an owner
  and expiry, with cleanup as part of finishing the feature. The table has `updated_by` but no expiry
  or ownership-lifecycle mechanism, and no CI sweep for stale flags. Evidence:
  `20260827120000_feature_flags.sql:12-19` (no expiry column). State: VERIFIED. Low impact today
  (one seeded flag) but will rot as flags accumulate.
- Anonymous cohorts differ by runtime (client per-session random vs edge `"anon"`), accepted for a
  telemetry ramp but means signed-out % rollouts are not cross-surface consistent. Evidence:
  `feature-flags.service.ts:54-63` vs `_shared/feature-flags.ts:55`. State: VERIFIED (documented tradeoff).

---

## 5 · Deploy observability & failure alerting — 62/100

**Strengths:**
- **Cache-proof stale-deploy verifier.** Every build stamps a per-commit marker at a unique path
  `/deploys/<sha>.txt`; `verify-deploy.yml` polls prod for up to ~15 min and fails RED if prod isn't
  serving the merged SHA — turning a silent "served old bundle for 11 days" into a loud dated signal.
  Evidence: `scripts/write-build-info.mjs:24-32`, `.github/workflows/verify-deploy.yml:48-71`, and a
  duplicate in-pipeline check `deploy-frontend.yml:98-121`. State: VERIFIED. This is excellent.
- Daily **config-preflight** drift sweep (Send Email hook enabled+pointed correctly, DB
  `environment_readiness()` has no missing/error rows) — fails loud on silent config drift.
  Evidence: `.github/workflows/config-preflight.yml:47-84`. State: VERIFIED.
- **edge-deploy-smoke** cron liveness-probes every function, reliability-hardened after a 36,270
  false-alarm incident (only a confirmed-missing JWT-gated function pages). Evidence:
  `supabase/functions/edge-deploy-smoke/index.ts:1-101`. State: VERIFIED.
- SBOM generated every build + retained 90 days. Evidence: `ci.yml:285-294`. State: VERIFIED.

**Gaps (Finding REL-2, HIGH):**
- **The loud-paging workflows do NOT watch the deploy workflows.** `main-failure-alert.yml` watches
  only `["CI", "Deploy edge functions", "Config preflight"]`. Evidence: `main-failure-alert.yml:16`.
  It omits **Deploy migrations**, **Verify deploy**, and **Deploy frontend**. So a failed
  auto-apply of a migration to prod (the exact feature_flags-unapplied outage class) and a
  verify-deploy stale-bundle detection are **not paged** — they only show as a red X nobody is
  subscribed to. State: VERIFIED.
- **`ci-alert.yml` watches a renamed/dead workflow.** It triggers on `["Regression", "Penetration
  tests", "Cross-browser QA"]`, but `ci.yml:3` states the unified pipeline "replaces regression.yml."
  The "Regression" trigger therefore matches nothing. Evidence: `ci-alert.yml:12-16` vs `ci.yml:1-3`.
  State: VERIFIED. The CI-red Discord/triage path for the main pipeline is likely dead (CI failures
  are instead caught by main-failure-alert's "CI" entry, so CI itself is covered — but ci-alert's
  own coverage is stale).
- **No deployment record** beyond the git SHA stamp — no record of which flags changed per deploy,
  who triggered, migration steps applied. Evidence: no `record_deploy`-style step in any
  `deploy-*.yml`. State: INFERRED (negative). Partial mitigation: build-info SHA + Actions history.

---

## 6 · Build-once immutable artifact & traceability — 55/100

**Gaps:**
- **Not build-once-promote; likely two frontend build paths.** `deploy-frontend.yml` rebuilds and
  deploys via `wrangler deploy` (`:64-96`), while `CLAUDE.md` Commands says the frontend deploys via
  **Cloudflare Pages git integration** and `ci.yml:16` references a **"Workers Builds:
  techfleetnetwork"** check — i.e. Cloudflare also builds on its side. The deploy-frontend workflow is
  a **green no-op until `CLOUDFLARE_API_TOKEN` is set** (`deploy-frontend.yml:41-49`), so which path is
  actually live is ambiguous, and if the token IS set both paths can race the same Worker. Evidence:
  `deploy-frontend.yml:1-10,41-49`, `CLAUDE.md` Commands, `ci.yml:16`, `wrangler.jsonc:1-4`.
  State: INFERRED — cannot see repo secrets/Cloudflare config. Limitation: this is a documentation/
  reality drift the team should resolve to one path.
- Edge functions are deployed **from source on push** (rebuilt per deploy), with no immutable
  artifact registry or redeploy-by-tag. Rollback is git-checkout-and-redeploy. Evidence:
  `deploy-edge-functions.yml:159-233`. State: VERIFIED. Acceptable for Supabase but not build-once.
- CI actions are **SHA-pinned** (supply-chain integrity) — credit. Evidence: `ci.yml:49,99`,
  `deploy-edge-functions.yml:83,89`. State: VERIFIED.

---

## Findings ranked

### CRITICAL
- **REL-1 — Expand/contract backward-compatibility is enforced by convention + reviewer only, with a
  realistic path to a deploy-time outage.** No mechanical gate detects a destructive/in-place schema
  change (`RENAME`/`DROP COLUMN`/in-place type change/`NOT NULL` without default) landing in an
  "expand" migration. `migration-smoke` proves apply-from-scratch, not mixed-version compatibility;
  `db-schema-gate` owns object PRESENCE and explicitly excludes in-place ALTERs/DROP-only/backfills
  (`check-db-schema-present.mjs:32-34`). Because migrations now auto-apply on merge
  (`deploy-migrations.yml:127-132`) and the frontend/edge deploy in parallel with no ordering, a
  single convention violation applies to prod and breaks the still-running old code during the
  Cloudflare build window — the precise outage class this program was built to prevent.
  *Smallest fix:* add a CI guard that scans new migration files for in-place contract DDL
  (`RENAME COLUMN`, `DROP COLUMN/TABLE`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`, signature-changing
  `CREATE OR REPLACE FUNCTION`) and fails unless an explicit `-- contract: <reason>` annotation marks
  it as a deliberate later-phase contraction. Evidence state: VERIFIED (absence of such a guard among
  the wired `scripts/ci/check-*` set in `ci.yml`).

### HIGH
- **REL-2 — Deploy-failure paging has holes over the highest-risk workflows.** `main-failure-alert.yml`
  does not watch *Deploy migrations*, *Verify deploy*, or *Deploy frontend* (`main-failure-alert.yml:16`);
  `ci-alert.yml` watches a dead "Regression" workflow (`ci-alert.yml:12-16` vs `ci.yml:3`). A failed
  prod migration-apply or a detected stale frontend is not paged. *Fix:* add "Deploy migrations",
  "Verify deploy", "Deploy frontend" to `main-failure-alert.yml`'s watch list; repoint ci-alert off
  "Regression". VERIFIED.
- **REL-3 — No staging; straight-to-prod with no real-traffic canary.** Commit → CI (local-only e2e)
  → 100% prod. No gated dev→staging→prod promotion, no bake time, no canary analysis before full
  cutover. Evidence: `ci.yml:681-798`, `CLAUDE.md` Commands. VERIFIED. *Mitigation present:* strong
  pre-merge gates + instant dashboard rollback keep MTTR low, but blast radius on a bad deploy is 100%.

### MEDIUM
- **REL-4 — Dual/ambiguous frontend deploy path (build-once violated).** wrangler-deploy workflow vs
  Cloudflare git-integration build; unclear which is authoritative, possible double-build race if the
  token is set. `deploy-frontend.yml:1-10,41-49` vs `CLAUDE.md`/`ci.yml:16`. INFERRED. *Fix:* pick one
  path, document it, disable the other.
- **REL-5 — No backup-before-destructive-migration, no RPO/RTO, no restore drills.** Skill-required for
  any destructive step. Absence in `rollback.md`/`migrations/CLAUDE.md`. INFERRED.
- **REL-6 — db-schema-gate pre-merge vs post-merge auto-apply ordering friction** (possible chicken-
  and-egg for net-new migrations). `check-db-schema-present.mjs:8-14` vs `deploy-migrations.yml:127-132`.
  INFERRED — team should confirm the intended merge workflow.

### LOW
- **REL-7 — Feature-flag hygiene: no expiry/owner-lifecycle/cleanup sweep.** `20260827120000_feature_flags.sql:12-19`.
  VERIFIED. Rot risk as flags accumulate.
- **REL-8 — No batched/resumable backfill harness for large data migrations.** INFERRED (negative).

---

## Top strengths (credit where earned)
1. **Cache-proof stale-deploy verification** (`write-build-info.mjs` + `verify-deploy.yml`) — a
   genuinely elegant, incident-driven solution to the silent-stale-bundle class. VERIFIED.
2. **Real kill-switch feature flags with safe-default-OFF and a drift-pinned bucketing contract across
   client+edge** (`feature-flags.service.ts` / `_shared/feature-flags.ts`). VERIFIED.
3. **Auto-applied migrations + fail-closed schema-reconciliation gate + blocking migration-smoke** —
   closes the hand-applied-migration outage class that the memory notes repeatedly cite. VERIFIED.
4. **Written, surface-complete rollback runbook** with instant dashboard rollback and 100%-traffic
   promotion handling. VERIFIED.

## Biggest limitation of this audit
Static read-only review of source. I **cannot verify runtime configuration**: whether
`CLOUDFLARE_API_TOKEN`, `SUPABASE_DB_PASSWORD`, `PROD_URL`, `DISCORD_ALERT_WEBHOOK`, and the
Management-API token are actually set determines whether deploy-frontend, the migration applier, the
stale-deploy verifier, and alerting are live or silently no-op'd (several workflows self-skip to green
when their secret is absent — `deploy-frontend.yml:41-49`, `config-preflight.yml:34-45`,
`incident-gate.yml:59-69`). A green Actions tab does not prove these guards are armed. The severity of
REL-2 in particular rises sharply if the deploy secrets are set but the webhook is not. I also did not
read every one of the ~N migration bodies, so REL-1/REL-8 rest on the absence of an enforcing guard
rather than a proven live violation.
