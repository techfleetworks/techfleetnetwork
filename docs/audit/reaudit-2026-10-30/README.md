# TechFleet Network — Enterprise-Readiness Re-Audit (2026-10-30)

**Date:** 2026-10-30
**Branch:** `audit/enterprise-readiness-2026-10-30` (worktree off `origin/main` @ `e4c36619`).
**Standard:** the 17 skills in `~/.claude/skills` (the updated set the owner uploaded 2026-10-30),
read from source. Three dimensions are assessed here that the 2026-10-09 audit did not score:
pattern selection, BDD as its own discipline, and the frontend (accessibility, browser/device,
usability).
**Posture:** skeptical architect. Every finding carries an evidence state
(`proven`/`observed`/`inferred`/`documented`/`reported`/`not-assessed`), a re-runnable source, and a
named limitation. Nine dimension auditors ran in fresh context; the lead (this session)
**independently re-verified the headline findings** before recording them. Where a subagent's claim
did not survive that re-verification, it was corrected here (see §3 and §7).

---

## 0. Headline

The code barely changed since 2026-10-09. The gate-hardening wave the prior audit asked for
**landed and is enforcing** (type-check, coverage, lighthouse, mutation, waiver-expiry) — quality
gates rose +9. The overall number still moves **down**, and almost all of that is **deeper method,
not regression**: this pass computed effective SQL grants per function, traced the paging and e2e
paths through live GitHub run history (not just config), and read the frontend the prior audit
skipped. Every dimension auditor said the same thing independently — the drop is measurement
catching up with reality, plus three newly-scored dimensions that sit below the existing average.

**Apples-to-apples overall (same 10 dimensions and weights as 2026-10-09): 67 / 100, down from 71.**
The **fuller** enterprise-readiness picture is **lower than 67**: folding in the three
newly-scored dimensions (pattern 66, BDD 18, a11y 55, browser 48, usability 63) drags it down. 67
is the number that is *comparable* to last time, not the number that is *complete* (see §8).

Two findings are genuinely net-new and actionable in-repo:

- **The Playwright e2e suite does not gate merges** (Critical). It is `SKIPPED` even on a PR that
  changed `src/`, and it is not a required check. *(observed by me — PR #449 + 3 main pushes.)*
- **"Sign out all devices" is not enforced server-side** (High). The durable revocation check
  (`is_session_revoked`) runs only in client code; no edge-auth or RLS path enforces it. *(observed
  by me.)*

The prior audit's one true Critical — **erasure does not reach external processors (Discord,
Freescout, Airtable, Braintrust)** — is **still open** and still needs owner-supplied secrets and
staging. It is joined by a sharper version of the same class: the erasure *gate passes green* while
checking only a hand-maintained 12-table list (§3, CMP-2).

---

## 1. Scorecard

### 1a. The ten weighted dimensions (comparable to 2026-10-09)

| # | Dimension (skill) | 2026-10-09 | 2026-10-30 | Δ | Why it moved |
|---|---|:--:|:--:|:--:|---|
| 1 | Database architecture & integrity | 86 | **77** | −9 | effective-grant analysis; prior M-2 was a false positive |
| 2 | OWASP secure coding | 85 | **78** | −7 | one new High (SEC-1); stricter skill (runnable @security scenarios); partial #428 |
| 3 | ADR discipline | 83 | **76** | −7 | index covers 14/86; renumber collisions have no map |
| 4 | Enterprise architecture | 79 | **72** | −7 | idempotency toolkit has 0 consumers; true UI-DB count is 88 not ~21 |
| 5 | judge-arch (four questions) | 74 | **70** | −4 | Q1 boundary still FAIL; one new ownership High |
| 6 | Release & deployment safety | 72 | **62** | −10 | live run-history: alerting dark 92 days; auto-apply would replay 730 migrations |
| 7 | Verifiable quality gates | 64 | **73** | +9 | type-check/coverage/mutation/waiver-expiry now real and enforcing |
| 8 | Compliance & data lifecycle | 62 | **56** | −6 | erasure gate bounded by a hand list; audit-log chain breaks itself |
| 9 | SRE operational readiness | 61 | **56** | −5 | SLO docs exist but SLIs/burn-rate not instrumented; paging fails open |
| 10 | Comprehensive test strategy | 43 | **44** | +1 | real gate gains cancelled by correcting the e2e/cross-browser "live" miscount |

**Weighted overall** (weights unchanged from 2026-10-09: sec 14, db 12, arch 11, judge 11, QG 11,
test 11, rel 10, comp 8, sre 7, adr 5):
`78·.14 + 77·.12 + 72·.11 + 70·.11 + 73·.11 + 44·.11 + 62·.10 + 56·.08 + 56·.07 + 76·.05 = 67.0`.

### 1b. Newly-assessed dimensions (not in the weighted headline, to keep the Δ honest)

| Dimension (skill) | Score | Band |
|---|:--:|---|
| Pattern selection | **66** | adequate, material risk |
| BDD (as a discipline) | **18** | failing |
| Accessibility (WCAG 2.2) | **55** | weak |
| Browser / device support | **48** | weak |
| Usability / universal design | **63** | adequate, material risk |

These three skill areas were never scored before. Folding them in would pull the overall **below
67**. They are reported separately rather than retro-weighted so the 71→67 comparison stays
apples-to-apples (skeptical-audit: a changed denominator must not masquerade as a real delta).

---

## 2. Method and coverage

- **9 parallel dimension auditors**, fresh context, each against its skill(s) + the 2026-10-09
  baseline, each writing a full report in this folder (`security.md`, `database.md`,
  `architecture-patterns-adr.md`, `judge-arch.md`, `testing-quality-gates.md`, `release-deploy.md`,
  `sre.md`, `compliance.md`, `frontend-a11y-browser-ux.md`).
- **Lead re-verification (this session):** the headline Critical/High findings were re-checked
  against the code and live GitHub state before entering this scorecard. Results and the two
  corrections are in §3 and §7.
- **What was executed:** Node CI guards (`check-erasure-completeness`, `arch-gate`,
  `check-guards-wired`, `emit-guard-matrix`) and read-only `gh` against the live repo (run history,
  job-level conclusions, secret *names*, rulesets). The TypeScript/Vitest/Deno/Stryker toolchain was
  **not** run (no `node_modules`; flaky msys fork on this host).
- **Not assessed (no prod/dashboard access):** live RLS/grants/policies, whether migrations are
  applied, PITR tier, whether integration secrets are set, rendered contrast, real browsers, screen
  readers. Findings that hinge on runtime are labelled accordingly.

---

## 3. Verified headline findings (lead-confirmed)

Severity = realistic prod impact. Evidence state is the lead's, after re-verification.

### CRITICAL

**RC1 — The Playwright e2e suite does not gate merges.** `e2e` (`ci.yml:740`) has
`needs: [detect-changes, setup, gate]` and `if: detect-changes.outputs.e2e == 'true'`, and it is
**not** a required check (branch protection requires only `ci / gate`). On **PR #449**, which changed
`src/lib/security.ts` and `src/test/`, the `e2e` check completed **SKIPPED**; same on 3 recent main
pushes that changed `src/` (#446/#447/#449), each with `gate: success`. So the browser suite runs on
effectively nothing and blocks nothing. **Evidence: observed** (job-level `gh` + `git show`).
**Limitation:** the exact reason `detect-changes` emits `e2e=false` on a `src/`-changing event is
**not fully traced** — the strongly-indicated cause is the `--depth=1` shallow fetch (`ci.yml:56`)
breaking the `git diff base...HEAD` merge-base, which would also under-trigger the `migrations`,
`functions`, and `db_schema` filters that share this job. That broader blast radius is a
**hypothesis** (step log not read). → **RP-A.**

### HIGH (new or materially sharper since 2026-10-09)

**RH1 — Server-side session revocation is enforced client-side only (SEC-1).** `sign-out-all-devices`,
`revoke-user-sessions`, `admin-sign-out-all-users`, and `finalize-password-reset` pass a **user id**
to `admin.auth.admin.signOut(userId, "global")` and swallow the error. The durable mechanism
(`is_session_revoked`) is called **only** in `src/features/auth/services/session.service.ts:302`;
`grep` finds no reference in `_shared/request-auth.ts` or any RLS path. A stolen token used directly
against the API (outside the app's JS) is not subject to the revoked check. **Evidence: observed**
(client-only enforcement, by me). Whether the GoTrue call also revokes refresh tokens server-side is
**not-assessed** (SDK behaviour / prod logs). → **RP-B.**

**RH2 — The erasure-completeness gate checks a hand list, not completeness (CMP-2).**
`check-erasure-completeness.mjs:41-54` proves that **12 named tables** appear in the winning
`handle_user_deletion()` — it does **not** prove every PII table is covered. I ran it: **exit 0**. The
auditor named ~10 PII-bearing tables outside the list (certifications with email + raw Airtable data,
outboxes, `trusted_devices`, agreement signatures, `discord_role_grant_queue`). **Evidence:** the gate
mechanism is **observed** (by me); that those specific tables leak is **inferred** (prod FKs
not-assessed). A green gate that can't see the real surface is the exact "gate can't detect" class this
program exists to kill. → **RP-C.**

**RH3 — The prompt-injection detector is duplicated; the tested copy is dead (PAT-1).**
`hasPromptInjectionPattern` (`src/lib/security.ts:1197`) has **zero production callers** (`grep`: only
its definition, its test, and a string literal in `sast.mjs`). The live guard is a **separate** copy,
`hasPromptInjection` (`techfleet-chat/index.ts:160`), with different patterns and no test.
**Correction to the subagent's framing:** it is **not** true that "the mutation gate climbed to 50 is
hardening dead code" — the gate covers all of `security.ts`, most of which is live; only this one
function is dead. The real finding is a duplicated-owner + untested-live-guard problem.
**Evidence: observed** (by me). → **RP-D.**

**RH4 — Main-branch failures page no one; alerting is dark (REL-1 / SRE-1..3).** `DISCORD_ALERT_WEBHOOK`
and `SUPABASE_DB_PASSWORD` secrets are **absent** (`gh secret list`), `main-failure-alert`'s last 5
runs are all **failure**, and `config-preflight` has been red since 2026-08-09. **Evidence: observed**
(by me, live `gh`). The paging path also fails open and dedupes a critical fingerprint forever, so a
repeat sign-in outage pages no one (SRE-1/2, observed in code). → **RP-F.**

### Carried-forward Critical (still held, needs the owner)

**RC0 — Erasure does not reach external processors.** `delete-account`/`admin-purge-auth-user` →
`auth.admin.deleteUser` → DB triggers, which cannot make network calls, so Discord, Freescout,
Airtable, and Braintrust records survive a "completed" erasure (EmailOctopus is handled). **Evidence:
observed** (code). Needs integration delete endpoints + prod/staging secrets + the auth regression
suite. This still blocks turning Braintrust on. → **PR-4 (held).**

### Other Highs by dimension (detail in the per-dimension reports)

DB-1 (SECURITY DEFINER functions only `REVOKE FROM PUBLIC`; default grants leave `anon`/`authenticated`
able to call PII-returning functions — *inferred*, needs prod `has_function_privilege`), CMP-3
(audit-log hash chain breaks itself via trigger name-ordering; verify never scheduled), CMP-4 (prior
H3 consent silent-failure still unfixed), CMP-5 (`export_my_data` omits 10+ PII stores), ARCH-1 (24/125
edge functions call external services with no timeout, incl. the sign-in path), ARCH-2 (0/43 `invokeEdge`
carry a schema; no frontend↔edge contract test), JA-1/JA-2 (status rules only client-side; applicant may
be able to set own `applicant_status` — *inferred*, needs prod policy check), PAT-2 (`techfleet-chat`
is a 2363-line god object), A11Y-1 (no blocking runtime a11y gate runs), BRW-1 (nothing but Chromium is
tested; 14-profile matrix parked at 0 green runs), TST-2/3/4 + BDD-1/2 (31 Deno tests unrun; pgTAP
non-blocking; cross-browser/a11y/visual manual-only; 99 Gherkin scenarios with no runner).

---

## 4. Remediation plan — PR-chunked

**Design bar for every PR (unchanged):** prevent by construction → a fail-closed CI gate → a
discrimination test that reddens when the fix is reverted. New guards self-declare a `// ci-lane:`
marker. This repo is a **consumer** of the skills: apply the skills and attach evidence; do **not**
add `docs/skill-receipts/` or `docs/arch-reviews/` entries (those are upstream-only).

### Wave 1 — the Critical + the net-new Highs (code + gate only, no prod needed)

- **RP-A (RC1).** Make `detect-changes` fail **open** (treat every filter as `true`) when its diff is
  empty or errors, so a broken merge-base can never silently skip e2e/migrations/db-schema. Add `e2e`
  (and the other change-gated jobs) as a required check *conditioned on the filter*, or convert the
  skip into an explicit pass only when truly unaffected. Discrimination test: a seeded `src/` change
  must make `e2e` run.
- **RP-B (RH1 / SEC-1).** One server-side revocation owner: add the `is_session_revoked` check to
  `_shared/request-auth.ts` so every authenticated edge call honours it; add a guard banning raw
  `admin.auth.admin.signOut` / client-only revocation. *(The refresh-token invalidation RPC migration
  is blocked on prod apply — note it, don't fake it.)*
- **RP-C (RH2 / CMP-2).** Replace the hand list in `check-erasure-completeness.mjs` with a
  registry/annotation that enumerates PII tables and fails if any is neither erased in
  `handle_user_deletion` nor on an `ON DELETE CASCADE` FK. Discrimination test: add a fake PII table →
  gate reds.
- **RP-D (RH3 / PAT-1).** Collapse the two prompt-injection copies into one shared, exported owner;
  test the live one; delete or wire the dead client copy.

### Wave 2 — systemic guard-widening + test wiring (code + gate only)

- **RP-E (REL-4 / DB-3).** Widen the expand/contract guard to the ~11 missed DDL forms (DROP TABLE,
  multi-line TYPE, RENAME TO, DROP FUNCTION, NOT NULL w/o default, non-concurrent index, FK w/o NOT
  VALID, TRUNCATE); one annotation per statement, not per file; grandfather shrink-only.
- **RP-F (RH4 / SRE-1..3 / REL-1).** A second alert channel that cannot be dark (open a GitHub issue
  via `GITHUB_TOKEN` when the webhook is unset); add a dedupe time-window; extend the watch list to
  migrations/verify/frontend. *(Setting the webhook + DB-password secrets is prod-blocked.)*
- **RP-G (BDD-1/2).** Add an executable Gherkin runner (cucumber-js) wired to CI, a feature-file
  index, and audience enumeration, so the 99 scenarios run and block.
- **RP-H (TST-2/3/4, A11Y-1, BRW-1).** Wire the 31 unrun Deno tests; make pgTAP blocking; un-manual the
  cross-browser / a11y / visual workflows (seed a local CI admin fixture); make an axe gate actually
  run on PRs.
- **RP-I (DB-1).** Migration revoking default `EXECUTE` from `anon`/`authenticated` on the affected
  SECURITY DEFINER functions + a blocking pgTAP assertion over every such function. *(Prod apply
  blocked; the migration + test are not.)*
- **RP-J (ARCH-2, ARCH-4, JA).** Add `bodySchema`/`responseSchema` to `invokeEdge` + a contract test;
  make arch-gate waivers per-count not per-file and fail on stale ones.

### Wave 3 — ADR + boundary burndown (continue existing programs)

- ADR index auto-generator + an old-number→file renumber map (ADR-1/2); flip the 3 "Proposed" ADRs
  for shipped work.
- **Do not duplicate:** the UI→Supabase boundary burndown (Q1) is the team's **ADR-0071** program —
  continue it there.

### Held — needs the owner (do not ship blind)

RC0 (external-processor erasure) + Braintrust enable; RH1's refresh-token RPC apply; DB-1 apply; JA-2
(prod RLS policy check first); REL-1/REL-2 (webhook + DB-password secrets, migration-ledger bootstrap);
PITR confirmation + a restore drill; branch-protection ruleset changes (make `e2e`, pgTAP, a11y
required); staging environment; signed DPAs. All of these need secrets, dashboard access, the auth
regression suite, or an owner decision.

---

## 5. Delta vs 2026-10-09 — what actually changed in the code

**Landed and verified enforcing:** real type-check (#416), coverage floor (#426), lighthouse
de-vacuumed (#423), mutation gate armed and climbed to `break 50` (#444–#449), waiver-expiry required
(#427), expand/contract guard (#424, but narrow — RP-E), Braintrust refuse-to-enable gate (#433). This
is the +9 on quality gates and real, measurable progress.

**Prior findings corrected (the earlier pass was wrong):** M-2 "4 functions missing search_path" was a
false positive (all 4 got it in `20260317212605`); EmailOctopus erasure was *not* orphaned (it has a
queued delete); permissive-RLS M3 was already fixed before the baseline.

**Same class, still open:** vacuous-gate risk persists in a new place (RC1 e2e); silent-failure
persists (CMP-4 consent); the external-erasure Critical (RC0) is unchanged.

---

## 6. Limitations

1. No prod access — grants, policies, applied-migration state, PITR tier, whether integration secrets
   are set, and rendered a11y are **not-assessed**. RC0 severity, DB-1, JA-2, and the DR items hinge on
   runtime.
2. Nothing in the toolchain was executed — gate *behaviour* is read from config + live `gh`, not a
   local run; the overall number assumes the CI config means what it reads.
3. RC1's broader blast radius (shared `detect-changes` filter) is a **hypothesis**; only the e2e
   symptom is observed.
4. Scores are judgments; the weights (§1a) are defensible, not objective. A different weighting shifts
   the overall ±5. Three newly-scored dimensions are deliberately excluded from the weighted headline.

---

## 7. Re-runnable verification

```bash
# RC1 — e2e skipped on a src-changing PR, and not required
gh pr view 449 -R techfleetworks/techfleetnetwork --json statusCheckRollup \
  --jq '.statusCheckRollup[]|select(.name=="e2e")|"\(.status) \(.conclusion)"'   # COMPLETED SKIPPED

# RH1 — durable revocation referenced only in client code
grep -rn "is_session_revoked" supabase/functions || echo "absent in edge"      # absent

# RH2 — erasure gate is a hand list and passes green
node scripts/ci/check-erasure-completeness.mjs ; echo "exit=$?"                  # exit=0

# RH3 — the tested prompt-injection copy has no production callers
grep -rn "hasPromptInjectionPattern" src supabase | grep -v test | grep -v sast  # def only

# RH4 — alerting is dark
gh secret list -R techfleetworks/techfleetnetwork | grep -i DISCORD_ALERT        # absent
gh run list -R techfleetworks/techfleetnetwork --workflow=main-failure-alert.yml -L 5 \
  --json conclusion --jq '.[].conclusion'                                        # failure x5
```

Full per-dimension reports with every finding, ID, evidence state, and smallest fix are in this
folder.

---

## 8. Skeptical self-audit of this report

Applying the same disconfirming discipline to this audit's *own* conclusions (owner's request). These
are the ways this report could be wrong, stated plainly rather than defended.

1. **The numeric scores are the subagents' judgments, not independently recomputed.** I re-verified
   specific *findings* (§3) against code and live `gh`; I did **not** re-derive each dimension's
   /100. Nine different auditors graded nine dimensions, so the scores carry **cross-agent calibration
   drift** — a 77 from one and a 72 from another are not guaranteed to be on the same scale. Treat the
   scores as **directional**; the findings and their evidence states are the load-bearing part.
2. **67 depends on a weighting I chose and a denominator I chose.** The weights (§1a) are defensible,
   not objective (±5 under a different weighting), and excluding the three new dimensions from the
   headline is a judgment made for comparability — it also happens to flatter the number. §1b and the
   headline now say so.
3. **"Decline" is mostly not decline.** The subagents were consistent that re-scoring only what the
   2026-10-09 pass examined would land near the old numbers (SRE ≈ 63 not 56; compliance ≈ 64 not 56;
   database's drop is method, not code). The −4 overall is **better measurement**, not a regression.
   The only genuine *new* weaknesses are RC1 (e2e gating) and RH1 (client-only revocation) — and even
   those are long-standing code that earlier passes missed, not fresh decay.
4. **RC1's "Critical" is a severity judgment.** It is a verification gap, not an exploitable hole or
   data loss, so a reasonable reviewer could call it High. It is marked Critical because "a required
   test layer gates nothing on a production app" is precisely the "defects reach prod because gates
   can't detect" class this program ranks highest. Named so the owner can re-rank it.
5. **Four Highs rest on `inferred` evidence** (DB-1, JA-2, CMP-2's specific table list, CMP-5). They
   are labelled, and each is routed to a **held / prod-check** step rather than a blind code change.
   Do not action them without the prod confirmation named in each.
6. **Single-pass findings.** Each dimension had one auditor; there was no second reviewer per
   dimension except the lead's spot re-verification of the headlines. A finding below the headline
   tier (e.g. the ~88 UI-DB call count, the 24 no-timeout functions) carries its author's
   true-positive rate, not a second confirmation.

Net: the **direction** (gates/ops/testing/compliance are the soft tiers; security and DB foundations
are strong; the gate-hardening wave genuinely worked) is well-evidenced. The **precise scores** are
directional, and the two net-new findings (RC1, RH1) are the ones worth acting on first.
