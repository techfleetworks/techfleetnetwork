# TechFleet Network — Enterprise-Readiness Audit & Remediation Plan

**Date:** 2026-10-09
**Branch:** `audit/enterprise-readiness-2026-10` (worktree off `origin/main` @ `77b0faeca`)
**Auditor posture:** skeptical solutions architect — claim-vs-reality, every finding carries a re-runnable source and a named limitation (`skeptical-audit` discipline).
**Standard:** the 13 skills in [`techfleetworks/enterprise-software-AI-skills`](https://github.com/techfleetworks/enterprise-software-AI-skills), read from source, scored against the live codebase.

---

## 0. The honest headline first

> "Make it structurally impossible to fail, error, bug out, or get hacked."

No software reaches a literal zero-failure guarantee — not a bank's, not a hyperscaler's. The defensible, enterprise version of that goal — and this repo's own stated philosophy — is **defense in depth + prevention by construction**: one owner per fact, boundaries that hold, failures that recover/retry/**report**, blast radius contained, and **every invariant enforced by a fail-closed gate with a discrimination test** so a defect cannot be *silently reintroduced*. That is the bar this audit scores against, and the bar every remediation PR in §7 is designed to.

**Overall grade: 71 / 100 — "Adequate; material risk," upper band, just below enterprise-ready-with-gaps.**

The foundations a breach or data-loss would exploit — security, database integrity, architecture — are genuinely strong (79–86, above typical for a 767-user app). The grade is pulled down by **verification and operations**: test coverage is unmeasured, two required CI gates are vacuous (false green), operational readiness (SLOs/DR) is largely on-paper, and right-to-erasure does not reach external processors. **The single highest-leverage theme is the same one the August audit named: defects reach prod because some gates can't actually detect.** It is much narrower now, but not closed.

---

## 1. Scorecard

| # | Dimension (skill) | Score | Band |
|---|---|:--:|---|
| 1 | Database architecture & integrity | **86** | enterprise-ready w/ gaps |
| 2 | OWASP secure coding | **85** | enterprise-ready w/ gaps |
| 3 | ADR discipline | **83** | enterprise-ready w/ gaps |
| 4 | Enterprise architecture standards | **79** | enterprise-ready w/ gaps |
| 5 | judge-arch (four questions) | **74** | adequate, material risk |
| 6 | Release & deployment safety | **72** | adequate, material risk |
| 7 | Verifiable quality gates | **64** | adequate, material risk |
| 8 | Compliance & data lifecycle | **62** | adequate, material risk |
| 9 | SRE operational readiness | **61** | adequate, material risk |
| 10 | Comprehensive test strategy | **43** | **weak** |

**Weighted overall = 71/100.** Weights (judgment, stated transparently; security & data integrity weighted highest for "hard to fail / hard to hack"): security 14, database 12, architecture 11, judge-arch 11, quality-gates 11, test-strategy 11, release 10, compliance 8, SRE 7, ADR 5. `= 85·.14 + 86·.12 + 79·.11 + 74·.11 + 64·.11 + 43·.11 + 72·.10 + 62·.08 + 61·.07 + 83·.05 = 71.4`.

---

## 2. Coverage & method (what "100%" means here)

- **Edge functions: 100% deep coverage.** All **125 serving functions** were read in full across 6 batched security reviews — not sampled. Verdict: **0 Critical, 1 High, ~27 Medium, ~33 Low** on exposure. See §4.
- **Mechanical sweep: 100%.** `scratchpad/scan-edge-fns.mjs` checked every function for audit-wrapper / CORS owner / service-role source / auth predicate / error-leak heuristics. Re-runnable; output matrix in `details/edge-fn-coverage-matrix.md`.
- **Frontend (1,236 files): 100% structural, not per-file deep-read.** Boundary/ownership/dependency/error violations were counted exhaustively by grep (that is the source of the "~55 UI files touch Supabase directly" figure). Per-file semantic review of the SPA was **not** done — see §6 limitations.
- **Database: declared-schema only.** 729 migrations analyzed as source text + CI config. **No live production DB access** — nothing below was confirmed against prod `pg_policy`/`pg_proc`.
- **Nothing was executed.** No `npm`/`tsc`/`vitest`/gate run (no `node_modules`; flaky msys fork on this host). Gate-behaviour findings are from reading config + compiler/tool semantics, and the four headline Criticals were **independently re-verified by the lead auditor** (noted inline).

Full per-dimension reports: `docs/audit/details/` (copied from the audit run).

---

## 3. Consolidated Critical & High findings (deduped, verified)

Severity = realistic prod impact. "Verified-by-lead" = re-read by the lead auditor, not only a subagent.

### CRITICAL

**C1 — Right-to-erasure does not reach external processors.** `delete-account` and `admin-purge-auth-user` call only `auth.admin.deleteUser` ([delete-account/index.ts:76](../../supabase/functions/delete-account/index.ts:76)), which fires DB triggers. The erasure trigger ([20260911120000](../../supabase/migrations/20260911120000_erasure_completeness_reconcile.sql)) is thorough on internal PII but is a Postgres trigger and **cannot make network calls**, so **Discord (guild/roles), Freescout (external customer), Airtable, and Braintrust** records survive a "completed" erasure. *EmailOctopus is correctly handled* by a dedicated trigger ([20260822150000](../../supabase/migrations/20260822150000_eo_contact_delete_on_account_deletion.sql)). **Evidence state: VERIFIED-by-lead** (both files read). GDPR Art. 17 exposure. → PR-4.

**C2 — The required Type-check gate is vacuous (false green).** [tsconfig.json:15](../../tsconfig.json) is `"files": []` + references-only; [ci.yml:229](../../.github/workflows/ci.yml:229) runs `npx tsc --noEmit` (not `tsc -b`), which compiles **zero `src/` files** → always exits 0. Any TypeScript regression ships green through the required `gate`. (ADR-0068 fix exists but is in unmerged PR #416.) **VERIFIED-by-lead.** → PR-1.

**C3 — Expand/contract is convention-only while migrations auto-apply in parallel with code.** No CI guard detects destructive DDL (RENAME/DROP COLUMN, type change, in-place NOT NULL) in an "expand" migration; `db-schema-gate` owns *presence*, not in-place ALTERs. Migrations auto-apply on merge ([deploy-migrations.yml](../../.github/workflows/deploy-migrations.yml)) with no ordering vs the parallel frontend/edge deploy. One convention slip breaks running old code in the deploy window — the exact outage class the program exists to stop. *Mitigant, VERIFIED-by-lead: zero real `DROP COLUMN` exists in 728 migrations today, so the convention currently holds — but nothing enforces it.* **Evidence state: VERIFIED (absence of guard) + INFERRED (ordering risk).** → PR-C3.

### HIGH

- **H1 — Lighthouse/perf gate is vacuous.** [lighthouse.yml:34,39](../../.github/workflows/lighthouse.yml:34) both end `|| true`; even `accessibility=error:0.9` (line 37) is swallowed. Cannot fail. **VERIFIED-by-lead.** → PR-3.
- **H2 — No application coverage gate.** `vitest.config.ts` has no `coverage` block/threshold; no `@vitest/coverage-*` dep; CI runs `vitest run` with no `--coverage`. "Tests pass" has no floor on code exercised. **VERIFIED-by-lead (absence).** → PR-2.
- **H3 — Silent-failure in legal consent revocation.** `revoke-recording-consent` drops `{error}` on both update and insert and returns `{ok:true}` unconditionally ([index.ts:43-65](../../supabase/functions/revoke-recording-consent/index.ts)) — a revocation can fail while reporting success. §4 + GDPR. → PR-8.
- **H4 — No error-budget/SLO alerting for the live app.** The only SLO doc covers a *future* SPF subsystem; member-facing SLOs are ⬜ planned. Paging today is static-threshold watchdogs. → PR-11.
- **H5 — No verified backup/DR.** No RTO/RPO, no restore test, no DR runbook; the team's own brief lists it open. (UNVERIFIED prod tier.) → PR-12.
- **H6 — Audit-log tamper-evidence defeatable by service role** (in-place recompute path, no off-box copy) + a `LIMIT 1` concurrent-insert race in the hash chain. → PR-13.
- **H7 — Braintrust may export verbatim member Q&A + real `user_id`, default-ON when the key is set**, with the DPA/retention/deletion-cascade listed unbuilt (ADR-0073). *Contingent: whether `BRAINTRUST_API_KEY` is set in prod is UNVERIFIED.* → PR-15.
- **H8 — ADR index stale / renumber breaks traceability.** README indexes only ADR-0001–0018 of 74; a merge renumber (0066→0073) means `git log --grep ADR-0073` misses the implementing commit. → PR-16.

### Systemic MEDIUM (contained, but broad — aggregate risk)

- **M-leak — §8 error-message/stack in responses:** confirmed by per-function read in **~25 functions** (mostly to already-authenticated callers; a few broader). The mechanical regex over-counts (many refuted) — the confirmed list is in `details/edge-batch-0*.md`. → PR-5.
- **M-authz — hand-rolled role checks** instead of the shared `requireAdminRequest`/`has_role` owner in **~20 functions** (correct queries, drift risk, not a present bypass). Only **6%** use the shared predicate. → PR-6.
- **M-controls — Origin-gated test-secret bypass** in `login-with-captcha` and `verify-turnstile` (a spoofed non-prod Origin + test token weakens the bot control). → PR-7.
- **M-cors — inline CORS omitting `x-trace-id`** in **48 functions** (preflight-break risk; already has a shrink-only guard). → PR-9.
- **M-anon-pii — `public-project-detail`** returns `clients.primary_contact` + staff names to anonymous callers. → PR-17.
- **M-waivers — 305 arch-gate waivers, 0 with an expiry** (`expires:""` on all; **VERIFIED-by-lead**), despite the "dated waiver only" rule — a permanent backlog with no burn-down pressure. → PR-10.

---

## 4. Edge-function deep review — 100% (125/125)

| Batch | Functions | Crit | High | Med | Low | Notable verified verdict |
|---|:--:|:--:|:--:|:--:|:--:|---|
| 00 | 23 | 0 | 0 | 2 | 9 | admin-purge/sign-out: `has_role` + fresh-2FA; service-role compare constant-time |
| 01 | 19 | 0 | 0 | 5 | 5 | all SSRF fetchers route through hardened `material-fetch.ts` allow-list |
| 02 | 23 | 0 | 0 | 8 | 5 | **Gumroad payment path sound** (const-time secret+seller_id, idempotent, ledger-only); handoff IDOR-controlled |
| 03 | 20 | 0 | 0 | 4 | 5 | **promote-to-admin/teacher authz sound** (403 non-admin, no self-escalation) |
| 04 | 19 | 0 | **1** | 6 | 4 | H3 silent consent-revoke failure |
| 05 | 21 | 0 | 0 | 2 | 5 | **no open relay** in any `send-*`; Fleety prompt-injection defense strong |
| **Σ** | **125** | **0** | **1** | **~27** | **~33** | |

**Bottom line:** at 100% coverage the edge tier has **no exploitable Critical and one High (a silent-failure bug, not an exposure).** The security maturity is real; the debt is systemic-but-contained hardening (leaks, predicate drift, two weakened test-controls).

---

## 5. Per-dimension summary

- **Database 86** — near-total RLS (189/190 live tables), 585/589 `SECURITY DEFINER` pin `search_path`, exemplary schema-drift gate (verifies real prod). Gaps: contract phase never runs (deprecated columns accrete), `NOT NULL DEFAULT ''` sentinel on `discord_user_id`, 4 functions missing `search_path`.
- **Security 85** — no Critical/High at 100% coverage; untrusted-content single-owner discipline + Fleety LLM hardening are textbook. Gaps: §8 leaks, predicate drift, service-role key read directly in ~95 fns.
- **ADR 83** — 74 ADRs, ship-with-code, MADR-grade, real collision root-cause fix. Gaps: stale index, renumber traceability, 3 doubled legacy numbers.
- **Architecture 79** — strong resilience toolkit actually applied (timeouts registry, backoff, DLQ, breaker), single client, 125/125 audit-wrapped. Gaps: no app-wide SLOs, scalability unproven at 10k, breaker not wired into `invokeEdge`, no API versioning/contract tests.
- **judge-arch 74** — Q1 Boundary **FAIL** (~55 live UI files hit Supabase directly; 100 waivers), Q2/Q3/Q4 pass-with-findings. Error-handling infra genuinely enterprise-grade.
- **Release 72** — cache-proof stale-deploy verifier + real kill-switch flags + auto-applied gated migrations. Gaps: C3, paging omits migration/verify/frontend workflows, no staging (100% cutover).
- **Quality gates 64** — guard-the-guard discrimination burned to zero (exemplary). Gaps: C2 (type-check), H2 (coverage), no product-code mutation testing, waiver hygiene.
- **Compliance 62** — rigorous DB-internal erasure + real consent engineering + DPIAs. Gaps: C1 (external erasure), H6 (audit-log), H7 (Braintrust), H5 (DR).
- **SRE 61** — error signal enforced against silent regression; textbook symptom-based watchdog + 26 runbooks. Gaps: H4 (SLOs), no burn-rate alerting, on-call = 1 human + webhook, no PRR.
- **Test strategy 43** — large, correctly-shaped, assertion-rich pyramid (465 unit, 40 pgTAP, ~72 edge-unit, 14-profile cross-browser). But the three pillars this dimension is named for — coverage gate, product-code mutation, consumer-driven contracts — are absent, and the perf gate is vacuous. The rigor is aimed only at the CI-guard fleet, never the product tests.

---

## 6. Audit limitations (what this does NOT establish)

1. **No live prod access** — RLS/grants/policies, SECURITY DEFINER bodies, GoTrue rate-limit config, Supabase backup tier, and whether `BRAINTRUST_API_KEY` is set are all **UNVERIFIED**. C1 severity partly, H5/H7 fully, hinge on runtime state.
2. **Nothing executed** — gate verdicts (C2/H1/H2) are structural, not demonstrated live; the ~71 overall assumes the CI config means what it reads.
3. **Frontend not deep-read** — SPA covered structurally (grep) only; a logic bug inside a component would not surface.
4. **DB sampled** — ~40 of 729 migrations read in full (recent + security-sensitive); the other ~689 were pattern-scanned.
5. **Shared helpers trusted by contract** in the edge batches (e.g. `has_role`, `material-fetch`, `authorizeServiceRoleRequest` read at call sites, not all re-audited line-by-line).
6. **Scores are judgments** — weights in §1 are defensible, not objective; a different weighting shifts the overall ±5.

---

## 7. Remediation plan — chunked into PRs

**Design rule for every PR (your bar):** 1) **prevent by construction** — make the defect *unwritable* (remove/seal the raw API, types that make it a compile error, one owner you can't bypass); 2) **enforce with a fail-closed gate**; 3) **prove the gate detects** with a discrimination test (it must go red when the fix/guard is reverted). A fix without (2)+(3) is a fix that regresses.

**Sequencing rationale:** Wave 1 fixes the **gates first** — because (the August lesson) a vacuous gate is why everything else reaches prod. Fixes that land on un-enforced ground regress; fixes that land after the gates are armed cannot. Then the Criticals, then systemic sweeps, then operations.

### Wave 1 — arm the gates + Criticals (blocking)

**PR-1 · Make the type-check gate real (C2).**
Prevent-by-construction: replace `tsc --noEmit` with project-aware `tsc -b` (or per-project `-p tsconfig.app.json`/`tsconfig.node.json`) so zero-file compilation is impossible. Gate: `check-typecheck-nonvacuous.mjs` that fails closed if the typecheck scans **0** `src` files (repo's own §6 "zero-scan = red"). Discrimination test: a fixture type-error must redden the gate. *Note:* arming this surfaces the hidden type errors memory records (~90) — they are fixed **in this PR** or it can't be green. Reconcile with PR #416/ADR-0068. Evidence: tsconfig.json:15, ci.yml:229.

**PR-2 · Real coverage gate (H2).**
Add `@vitest/coverage-v8` + a `coverage` block with thresholds; CI runs `--coverage`. Prevent-by-construction: a **shrink-only ratchet** (`coverage-floor.json`) so the floor can only rise — mirrors the existing dropped-error budget pattern. Discrimination test: dropping below floor fails. Evidence: vitest.config.ts (absent), ci.yml:262.

**PR-3 · De-vacuum the Lighthouse/perf gate (H1).**
Remove both `|| true`; make perf + a11y budgets error-level against a **pinned build artifact** (not live prod). Gate: extend `check-ci-guard-integrity` to forbid `|| true` after `lhci assert`/`collect`. Discrimination test: a seeded budget breach reds. Evidence: lighthouse.yml:34,39.

**PR-4 · Erasure reaches external processors (C1).**
Prevent-by-construction: a single **erasure orchestrator** in the `delete-account`/`admin-purge` edge path that enumerates every external PII sink and calls each integration's deletion handler; it **fails closed** (audited, retried) if a registered sink has no handler. Gate: extend `check-erasure-completeness.mjs` to assert every registered integration sink (Discord, Freescout, Airtable, Braintrust) has a deletion step — a new integration storing PII must register or CI reds. Discrimination test: add a fake sink → gate reds. Evidence: delete-account/index.ts:76, 20260911120000 (verified). Keep the EO trigger as the model.

**PR-C3 · Expand/contract enforcement guard (C3).**
Prevent-by-construction: a CI guard that parses each new migration and **flags destructive DDL** (RENAME COLUMN, DROP COLUMN, type change, in-place SET NOT NULL, signature-changing CREATE OR REPLACE) unless the migration carries an explicit, reviewed `-- contract: <reason>` annotation **and** a prior expand migration is present. Gate fails closed. Discrimination test: an un-annotated `DROP COLUMN` fixture reds. Plus: add deploy-ordering (expand migration verified applied before dependent code). Evidence: check-db-schema-present.mjs:32-34, deploy-migrations.yml.

### Wave 2 — systemic sweeps (each ships its guard)

**PR-5 · Kill the §8 error-leak class.** Make the client-facing response builder (`_shared/http errorResponse`) the only error-response path — it takes an `Error` + static message, so raw error text has nowhere to go. Migrate the ~25 confirmed sites. Gate: ESLint rule + `check-no-error-message-in-response.mjs` banning `.message`/`.stack`/`String(err)` reaching a Response body outside the error-owner; shrink-only grandfather. Evidence: `details/edge-batch-0*.md` confirmed list.

**PR-6 · One auth predicate.** Make `requireAdminRequest`/`has_role` the only admin gate and `authorizeServiceRoleRequest` the only service-auth. Migrate the ~20 hand-rolled sites. Gate: ban `from('user_roles')` as a gate in handlers outside `_shared`, and bespoke `=== SERVICE_ROLE` compares; shrink-only. Evidence: matrix 43/125; promote-to-admin:80, fleety-embed:119, etc.

**PR-7 · Security-control parity.** Add `requireFreshAdmin2fa` to `promote-to-teacher`; re-key the captcha/turnstile test-secret bypass on a **server-side env flag, not the Origin header** (makes the bypass branch unreachable in prod by construction). Gate: test asserting promote-to-teacher requires 2FA + the bypass branch reads env not headers. Evidence: batch-03 M1, batch-02/05 F1.

**PR-8 · Silent-failure sweep.** Fix H3 first; extend the existing `no-dropped-supabase-error` ESLint + budget to `supabase/functions/**`; shrink-only. Evidence: revoke-recording-consent:43-65.

**PR-9 · Inline CORS burn-down.** Migrate the 48 inline-CORS functions to the shared owner; this is burning down the existing `check-no-inline-cors` grandfather, not new machinery. Evidence: matrix 48/125.

**PR-10 · Waiver hygiene.** Prevent-by-construction: make `expires` a **required, non-empty** field — `arch-gate.mjs` rejects a waiver without a future date (fail closed); backfill the 305 with review deadlines. Evidence: arch-gate.waivers.json (305×`expires:""`, verified), arch-gate.mjs:155.

**PR-17 · Anon PII + small DB hardening.** Strip `primary_contact`/staff names from `public-project-detail`; pin `search_path` on the 4 functions missing it; plan the `discord_user_id` sentinel fix (expand/contract). Evidence: batch-03 M2, email_infra.sql:129-156, 20260315203254:1.

### Wave 3 — operational (larger programs, not single PRs)

- **PR-11 · Member-facing SLOs + error-budget burn-rate alerting** (four golden signals, p95/p99 latency view).
- **PR-12 · Backup/DR** — confirm PITR, test a restore, write the DR runbook, set RTO/RPO.
- **PR-13 · Audit-log tamper-evidence** — off-box append, fix the `LIMIT 1` race (H6); **consumer-driven contract tests** frontend↔edge (shared zod schema or Pact).
- **PR-14 · Mutation testing of product code** (stryker) with a score gate — point the repo's existing discrimination rigor at the product tests, not just the guards.
- **PR-15 · Braintrust PII governance** — make the key structurally refuse to enable until DPA + 30-day retention + deletion-cascade are wired (ties into PR-4).
- **PR-16 · UI→Supabase boundary burn-down** — move the ~55 live direct calls into hooks/services (burns down the 100 Q1 waivers); + ADR index auto-check (H8).

---

## 8. August 2026 → October 2026 comparison

August logged **~930 findings** (837 architecture: 179 High/430 Med/228 Low; security: 3 Critical + 15 High; System-Health: 4 P0) and a **security scorecard of 6/6 skills FAIL.** Its stated root cause: *"systemic auth/trust and silent-failure defects reaching production because the test/CI gates were vacuous"* (migration-smoke force-disabled; smoke tests only grepping source).

**What closed (verified this pass):**
- migration-smoke is now **blocking**; the schema-drift gate verifies **real prod** (ADR-0036) — the "verify a ledger not reality" class is fixed.
- Guard-the-guard **discrimination burned to zero** — every guard has a committed, discrimination-proven test.
- Unsigned-JWT service-role fallback **removed**; admin mass-actions now `has_role` + fresh-2FA.
- Erasure clobber (August H9) **fixed and guarded** (ADR-0039) — for *internal* PII.

**What carried forward (same class, narrower):**
- **Vacuous gates still exist** — type-check (C2) and Lighthouse (H1). The August lesson is not fully learned until no required gate can false-green.
- **Silent-failure not eliminated** — H3 is a 2026-10 instance of the exact August theme.
- **Coverage/mutation/contract gaps** (H2, PR-14, PR-13) — August's "gates are theater" critique still applies to the *product* test suite.

**Trajectory:** from 6/6-fail + 3 live Criticals to **0 exploitable edge Criticals + strong secure foundations**, with the remaining Criticals being a compliance-cascade gap and two false-green gates. Real, measurable improvement; the job is finishing the gate-integrity story and the operational tier.

> ⚠️ August's static "all-clean" security report (SAST 49/49, OWASP 120/120) contradicted its own live P0s — and we re-confirmed its successor `pentest-report/sast.md` is **stale** (dated April, 49 fns vs current 125). Do not treat that artifact as current coverage.

---

## 9. Reproducibility

- Edge mechanical sweep: `node scratchpad/scan-edge-fns.mjs supabase/functions out.md`
- Waiver expiry: `grep -o '"expires"[^,}]*' arch-gate.waivers.json | grep -v '""' | wc -l` → expect `0`
- Type-check vacuity: inspect `tsconfig.json` (`"files": []`) + `.github/workflows/ci.yml:229` (`tsc --noEmit`)
- Lighthouse vacuity: `.github/workflows/lighthouse.yml:34,39` (`|| true`)
- Erasure boundary: read `supabase/functions/delete-account/index.ts` + `supabase/migrations/20260911120000_*.sql` + `20260822150000_*.sql`
- Full per-dimension + per-batch detail reports: `docs/audit/details/`
