# SRE Operational Readiness: re-audit 2026-10-30

Scope: SRE dimension only. Repo read-only at `C:\Users\morga\Documents\tfn-reaudit`, HEAD
`e4c366190` (2026-10-17). Standard: `sre-operational-readiness/SKILL.md` and
`skeptical-audit/references/evidence-discipline.md`. Baseline: 2026-10-09 audit, SRE 61
(`docs/audit/details/sre-readiness.md`).

No prod or dashboard access. Live cron state, the Vault secrets, GitHub secrets, PITR tier, real
alert history, and actual uptime are all **not-assessed**.

## Score: 56 / 100. Band: 40-59 "weak". Delta: -5 from 61.

**Why it went down.** No SRE code got worse. Since 2026-10-09 the only SRE change is #431
(`80fba60b4`), which added two docs and no code (`git show --stat 80fba60b4`: 2 files, 110
insertions, both under `docs/`). Six commits touched `supabase/migrations` or `supabase/functions`
since then, and none of them touch telemetry or alerting. The score drops for two reasons:

1. This audit traced the **paging delivery path** end to end. The prior audit did not. That path
   has defects that existed before 2026-10-09: a fingerprint gets paged at most once ever, a page
   counts as "sent" even when it reached zero people, and errors are dropped in the paging code
   (SRE-1, SRE-2, SRE-3).
2. The new SLO doc gives partial credit, but it is documented and not observed. Of its 4 journeys,
   1 has an SLI in code, 1 is partial, and 2 have none. Nothing in code computes an SLO, a budget,
   or a burn rate.

A like-for-like re-score of only what the prior audit looked at would be about 63 (+2 for the docs).
The -5 is a deeper inspection, not a regression.

| # | Sub-criterion | Weight | Prior | Now | Weighted |
|---|---|---|---|---|---|
| 1 | SLIs / SLOs / error budgets | 20% | 45 | 50 | 10.0 |
| 2 | Golden signals and observability | 20% | 62 | 60 | 12.0 |
| 3 | Alerting: symptom-based, burn-rate, delivered, actionable | 20% | 70 | 52 | 10.4 |
| 4 | Incident response, on-call, postmortems | 15% | 48 | 45 | 6.75 |
| 5 | Runbooks and production-readiness review | 15% | 68 | 66 | 9.9 |
| 6 | Self-healing, meta-monitoring, data safety | 10% | 75 | 65 | 6.5 |
| | **Total** | | 61 | | **55.55, rounded to 56** |

---

## SLO to SLI to alert to burn-rate trace (`docs/sre/core-app-slos.md`)

| SLO (doc line) | SLI emitted in code? | Alert on it? | Burn-rate? | State |
|---|---|---|---|---|
| 1. Sign-in ≥99.5% / 28d (`core-app-slos.md:13`) | **Yes, two sources.** (a) RUM: `emitAuthBeacon` writes `auth.signin.success/invalid_credentials/network_error/service_unavailable/...` to `ops_events` through `record_event` (`src/features/auth/services/auth-telemetry.ts:20-48,68-75`). There are 26 call sites across 8 auth files, with `latencyMs` in the payload (`:53`). (b) Synthetic: `auth-prober` runs every 5 min and writes `auth_prober_results` with `outcome` and `latency_ms` (`supabase/functions/auth-prober/index.ts:163-198`; cron `supabase/migrations/20260707200000_recreate_cron_jobs_on_live_project.sql:187-188`). | **Partly.** The prober pages after 2 strikes through `agent_fix_queue` and then `notify-critical-fix` web-push (`auth-prober/index.ts:173-219`). That path is broken in ways that make it unreliable (SRE-1, SRE-2). Nothing alerts on the RUM success ratio. | **No.** No query or view anywhere computes good/total over a window. | Signal **observed** (code). Alert **observed**, delivery flawed. Burn **observed absent**. |
| 2. Application submit ≥99.5%, ≥95% under p95 (`:14`) | **No.** `ProjectApplicationPage.tsx:388-422`: success opens the celebration dialog, and `onError` only shows a toast (`:422`). No `ops_events` outcome for the good or the bad case. Zero-row writes do reach triage through `assertWritten` and `reportError` (`src/lib/db-helpers.ts:46-55`), but a PostgREST error is thrown before that, so it is not counted. The only `record_event` save beacons are the **admin** project save (`ProjectFormPage.tsx:469-490`, `admin.project.save.*`) and welcome completion (`profile.service.ts:259-265`), not member applications. | No | No | **observed absent** |
| 3. Dashboard load ≥99.5%, ≥95% under p95 (`:15`) | **Latency proxy only.** RUM web-vitals carry `route` (`src/lib/web-vitals.ts:154,190`). That table is purged at **7 days** (`20260531042114_...sql:61`), so a 28-day latency SLO cannot be computed. No load success or failure event: no `record_event` or beacon in `DashboardPage.tsx` (grep returned 0). | No | No | **observed absent** (availability), partial (latency) |
| 4. Fleety turn ≥99% non-degraded (`:16`) | **Numerator only.** A degraded turn writes `fleety_chat_degraded` to `audit_log` with a reason dimension (`supabase/functions/techfleet-chat/index.ts:2197-2221`). No durable count of successful turns (the denominator) was found in the handler. Braintrust would have it, but it is a fail-safe no-op until `BRAINTRUST_COMPLIANCE_READY` is set (`_shared/observability/braintrust.ts:127-138`), and whether that is set is unknown. | Indirect: `severity:'error'` audit rows feed `evaluate_system_health` static counts, which change a status flag and page nobody (SRE-6). | No | **observed** numerator, denominator **not-assessed / absent in code** |

Repo-wide check for burn-rate logic:
`rg -i "burn.?rate|error.?budget|slo_|sli_" --glob '!docs/**'` returns only the unrelated
"dropped-supabase-error budget" lint (observed). **Nothing in code computes an error budget or a
burn rate. Prior H1/H4 are unchanged.**

---

## Findings

Evidence states follow the contract: proven / observed / inferred / documented / reported /
not-assessed.

| ID | Sev | Location | What | Why it matters | State | Re-runnable source | Limitation | Smallest fix (prevent, then gate, then test) |
|---|---|---|---|---|---|---|---|---|
| **SRE-1** | **High** | `supabase/functions/notify-critical-fix/index.ts:63-68,115-121`; `auth-prober/alert.ts:20`; `migrations/20260505020417_...sql:2` | **A critical fingerprint pages at most once, forever.** `alreadyPushed` checks `triage_critical_push_log` by fingerprint with no time window. The auth-prober fingerprint is static per stage set (`auth_prober.stage_failure.<stages>`). Nothing ever deletes from `triage_critical_push_log`: the only writer is this function and no migration purges it. Also, the `agent_fix_queue` upsert (`auth-prober/index.ts:212-214`) does not reset `status`, so a row closed by `auto-resolve-fix-queue-nightly` stays out of the `status IN (pending,triaged,proposed)` filter (`:55`). | The **second** time sign-in breaks the same way, nobody is paged. This is the canonical SEV1 ("members cannot sign in", `core-app-slos.md:43`). It fails silently, which is the opposite of the watchdog's purpose. | **inferred** from observed code (no push-log purge found; static fingerprint observed). | `rg -n "triage_critical_push_log" supabase/` (1 migration plus 1 function, no DELETE); read `notify-critical-fix/index.ts:63-68` | Whether prod has a hand-run purge or already-pushed rows: not-assessed. | **Prevent:** dedupe on `(fingerprint, incident window)`. Re-arm when the fingerprint's `last_seen` is newer than its last push plus a cool-down, and have the producer upsert reset `status='pending'`. **Gate:** a pgTAP or Deno test: page, resolve, recur, and assert a second push. **Discrimination:** revert to the fingerprint-only dedupe and the test fails. |
| **SRE-2** | **High** | `notify-critical-fix/index.ts:41-44,51-60,74-84,93-121` | **The paging path fails open in five places.** (1) `{count}` drops `error`, so a failed cap query reads as 0. (2) `{data: candidates}` drops `error` and returns `ok, sent:0`. (3) Zero admins gives `ok, sent:0, reason:no_admins`, with no Discord fallback. (4) Each push failure is swallowed by an empty `catch` (`:111-113`), and `resp.ok=false` is just not counted. (5) The push is logged with `recipients_count: 0`, `totalSent += 1` runs anyway (`:115-121`), and it is never retried. (6) A **platform-wide cap of 3 per hour, sorted by `occurrence_count`** (`:27,57`) lets high-volume, low-value client errors starve the low-count auth-prober page. | "We will be paged when users are affected" is the central SRE claim. Here the only sign-in pager can report success while reaching nobody. Under the skill rule this is **below observed**, so no "ready" verdict. It also breaks the global rule "every catch must recover, retry, or report." | **observed** (code read) | Read `notify-critical-fix/index.ts:30-125` | Live push-subscription count and the real delivery rate: not-assessed. | **Prevent:** take `{data,error}` everywhere and throw so `withAuditWrapper` reports it. Treat `recipients===0` as not sent: do not log it, fall back to the Discord webhook, and record `ops_events severity=error`. Reserve cap headroom for symptom alerts (`source in (auth-prober, watchdog)`), or sort by severity class before count. **Gate:** add this file to the `no-dropped-supabase-error` scope (check whether `supabase/functions` is excluded) and remove it from the grandfather list. **Test:** zero subscribers means Discord is called and nothing is logged; all pushes failing means no log row. |
| **SRE-3** | **High** | `.github/workflows/config-preflight.yml:34-45,48,71`; `incident-gate.yml:59-72`; `main-failure-alert.yml:16` | **The meta-monitor fails open, and main-failure-alert does not cover all prod writers.** `config-preflight` is the only thing that alerts when a watchdog cron (`auth-prober-5min`, `auth_email_watchdog_15m`, `triage-critical-push`) has stopped (`environment_readiness` section 4, `20260826140000_...sql:93-150`). If either secret is unset it **skips with a green result**, and `main-failure-alert` only fires on `conclusion=='failure'` (`:25`), so nothing pages. `incident-gate` does the same (prior M2, **still open**). Separately, `main-failure-alert` watches only `CI`, `Deploy edge functions`, and `Config preflight` (`:16`). **`Deploy migrations` (a prod DB writer, `deploy-migrations.yml:127-132`) and `Verify deploy` are not watched**, so a failed prod migration apply does not page. | A dead watchdog plus a skipped preflight gives total silence, with green CI. This is the "theater" failure mode the skill warns about. The daily cadence also means up to 24 h before a stopped watchdog is noticed. | **observed** (YAML read) | Read the three workflow files at the cited lines | Whether the secrets are set in GitHub today: not-assessed. The workflow-run history would settle it. | **Prevent:** a missing secret becomes `exit 1` on `schedule` events (keep the skip only for `workflow_dispatch` dry runs). Add `Deploy migrations` and `Verify deploy` to `main-failure-alert.workflows`. Run preflight hourly. **Gate:** a `scripts/ci` guard that every workflow writing to prod is listed in `main-failure-alert.yml` and has no skip-green on `schedule`. **Test:** a fixture workflow with a skip-green guard fails the guard. |
| SRE-4 | Medium | `supabase/migrations/20260708200000_auth_email_watchdog.sql:126-143`; `20260826140000_...sql:64` | The auth-email watchdog's Discord page needs Vault `discord_alert_webhook`. If it is absent, the code skips the page silently (`EXCEPTION ... NULL`, then `IF v_webhook IS NOT NULL`) and still sets `last_alert_at`, which suppresses the next 2 h. `environment_readiness()` checks `project_url` and `email_queue_service_role_key` but **not** `discord_alert_webhook`. `prober_fresh` is computed (`:71`) but never alerted on. | The textbook symptom alert can be silently disarmed with no detector. | **observed** | `rg -n discord_alert_webhook supabase/` (1 file only) | Whether the Vault secret exists in prod: not-assessed. | Add `discord_alert_webhook` to the readiness section 3 list. Only set `last_alert_at` when a post was attempted. Alarm when `prober_fresh=false`. pgTAP: webhook absent means readiness returns `missing`. |
| SRE-5 | Medium | `docs/sre/core-app-slos.md` (all); `docs/runbooks/backup-and-dr.md:31-37,52` | **SLOs and DR are documented, not observed.** The SLO doc is marked "DRAFT". Latency targets are "_(baseline)_" placeholders. The doc's own rollout steps 1-5 (`:51-55`) are not done in code (table above). The DR runbook marks every restore-test step ⬜. Owner is "_(assign)_". No restore-test record exists (`rg -i "restore (test\|drill)\|measured RTO" docs/` returns only plans and earlier audits that call it open). | Prior H4/H5 move from "absent" to "**documented**", which is not "observed". RPO ≤5 min depends on a PITR tier that nobody has verified. | **observed** (doc read, record absent); PITR **not-assessed** | `git show --stat 80fba60b4`; grep above | A restore may have been done and not written down. Not counted. | Run one restore drill and commit `docs/runbooks/dr-drills/2026-Qn.md` with timestamps and measured RTO. Add a dated "last drill" field and a CI check that fails when it is older than 100 days. |
| SRE-6 | Medium | `supabase/migrations/20260418201529_...sql:132-187` | `evaluate_system_health()` (cron every minute) uses **static absolute counts** (`>25` / `>100` audit errors per 5 min, backlog counts). They are not rates over traffic and are not tied to an SLO. A state change only updates `system_health_state` and pages nobody. The function is also `GRANT EXECUTE ... TO authenticated` (`:190`), so any member can trigger the state write. | Thresholds that ignore traffic both over-page and under-page as traffic changes. The degraded/overloaded transition has no alert. | **observed** | Read the cited lines | A later redefinition: only 2 files define it. Checked `20260501160148`, which only changes grants. | Replace with a ratio over `ops_events` per journey. Emit `record_event` and page on a transition to `overloaded`. Revoke `authenticated`. |
| SRE-7 | Medium | `src/pages/ProjectApplicationPage.tsx:388-422`; `src/pages/DashboardPage.tsx` | SLIs 2 and 3 have no emitter (see table). Copy the existing `withBoundedSave` beacon pattern. | 2 of 4 member SLOs cannot be measured. | **observed** | Grep `p_kind` in `src/` returns 3 emitters only | none | Emit `app.submit.{ok,error}` and `dashboard.load.{ok,error}` through one shared `recordJourneyOutcome()` owner, not inline in pages. Add an arch-gate rule: SLO journey pages must call it. Add a unit test. |
| SRE-8 | Medium | `migrations/20260531042114_...sql:61`; `core-app-slos.md:11` | `web_vital_samples` is kept 7 days, but the SLO window is 28 days. `ops_events` is kept 90 days (`20260602230329_...sql:33`, OK). | The latency SLO cannot be evaluated over its own window. | **observed** | Read the cited lines | none | Roll up daily p50/p95/p99 per route into a 28-day-plus aggregate table before the purge. |
| SRE-9 | Medium | `migrations/20260708200000_...sql:137-139`; `notify-critical-fix/index.ts:87`; `.github/workflows/*` | **No alert links to a runbook.** The Discord text says "Check Supabase Auth → SMTP + Resend NOW". The push links to the triage tab. `rg runbook .github/workflows` returns 0. There are 28 runbooks, but none are wired to their alerts. | Skill Step 3 says every alert must link a runbook. A 3 a.m. responder has to search for it. | **observed** | grep cited | none | Add a `runbook_url` to every alert payload. Since alerts are SQL and YAML, not Prometheus, add a small `scripts/ci/check-alert-has-runbook.mjs` over migrations that call `net.http_post` to a webhook and over the `main-failure-alert` message. |
| SRE-10 | Medium | `core-app-slos.md:57`; repo | **On-call is still 1 human.** No rotation, escalation, ack-timeout, or IC/Comms split. No postmortem template or archive (`git ls-files` matching `postmortem` returns 0). No PRR document or gate. | Prior H3/M1/M3 are unchanged. The doc now states the single-maintainer risk honestly (partial credit). | **observed** | `git ls-files \| rg -i "postmortem\|prr\|production-readiness\|on-?call"` | Off-repo process: not-assessed. | Add `docs/sre/postmortems/TEMPLATE.md` and a PRR checklist per journey. Name a second notification target in the SLO doc. |
| SRE-11 | Low | `auth-prober/index.ts:180-195,198-201` | The "two-strike" debounce counts any `err` row among the last 20 for that stage, not specifically the previous run, so an old blip can turn a new blip into a page. The prior-row query drops `error`, which means no page. Insert failure only does `console.warn`. | Noise in one direction, silence in the other. | **observed** | Read the cited lines | none | Compare against the previous run's `correlation_id`. Treat a query error as a page. |
| SRE-12 | Low | system | No span-level tracing. The correlation ID exists (`auth-telemetry.ts:51,84-92`; `x-trace-id` per prior S2). No traffic or saturation SLI per journey (prior H2, unchanged). | Prior H2 is still open. | **observed** (no new code) | `git log --since=2026-10-09 -- supabase/functions src/lib` | none | Per SLO doc rollout step 2. |

### Disconfirming-case-first record (Critical/High)

- **SRE-1.** The claim is "a recurrence never pages." I looked for whatever would make it false:
  (a) a purge of `triage_critical_push_log` in any migration or function. Grep found only the
  `CREATE` migration and the single writer, with no `DELETE` or cron. (b) A time-bounded
  `alreadyPushed` query. `:63-66` has no `pushed_at` filter. (c) A producer that varies the
  fingerprint per incident. `alert.ts:20` builds it from stage names only. (d) An upsert that
  re-opens status. The payload in `alert.ts:5-11` has no `status` field. None of these were found,
  so the claim holds. It stays **inferred**, not observed, because a manual prod purge is possible.
- **SRE-2.** I looked for a retry or fallback that covers `recipients=0`. `recipients_count` is
  written once and read nowhere (`rg recipients_count`: types.ts plus the writer only). I looked
  for a Discord fallback in the function and found no webhook reference. I also checked whether
  `withAuditWrapper` would catch these failures. It only catches throws, and these paths `return`
  normally. The claim holds.
- **SRE-3.** I looked for another meta-monitor that pages on a stopped watchdog cron. The auth-email
  watchdog computes `prober_fresh` but does not alert on it (`:71`). `evaluate_system_health` does
  not check cron. `environment_readiness` is the only check, and only `config-preflight` calls it.
  I looked for whether `main-failure-alert` also covers skipped runs: `if: conclusion=='failure'`,
  and a skipped step still ends as success. I looked for whether `deploy-migrations` alerts by
  itself: it has no notify step. The claim holds.

---

## Prior findings: status

| Prior | Status 2026-10-30 | Evidence |
|---|---|---|
| C1 / H4: no member-facing SLOs | **Partly addressed: documented only.** SLOs exist as a DRAFT. 2 of 4 SLIs are not emitted, and nothing computes SLO attainment. | table above |
| H1: no burn-rate alerting | **Open** | grep shows no code |
| H2: golden signals uneven, no tracing | **Open**, and the 7-day RUM retention gap is now named (SRE-8) | SRE-8, SRE-12 |
| H3: on-call is 1 human | **Open** (now stated in the doc) | SRE-10 |
| H5: no verified backup/DR | **Partly addressed: documented.** The restore test was never recorded. PITR not-assessed. | SRE-5 |
| M1: no postmortems | **Open** | SRE-10 |
| M2: DB gates skip with a green result | **Open, and wider:** `config-preflight` does the same, and it is the meta-monitor | SRE-3 |
| M3: no PRR | **Open** | SRE-10 |
| L1: runbook TODOs | Not re-checked in depth (28 runbooks now, 26 before) | not-assessed |
| L2: dashboard not organized by golden signal | **Open**. No service-overview dashboard was added. | `git log` |
| S1-S6 strengths | Still present. Not re-verified line by line. Error-signal guards were confirmed in `ci.yml:219-220`. | partial |

## Strengths (still earned)

- A synthetic black-box sign-in prober every 5 min, with stored per-stage latency. This is a real
  SLI source for SLO 1.
- `environment_readiness()` checks that critical crons are present and not stale. That is the right
  idea; it is undermined only by SRE-3.
- The auth-email watchdog is symptom-based, does not depend on the systems it watches, and is
  deduplicated.
- `ops_events` is kept 90 days and has a single `record_event` writer (ADR-0060).
- Fleety degradation has a reason dimension (`out_of_credits | rate_limited | gateway_error`).
- The SLO doc's content is correct: exclusions, budget policy, SEV definitions, and it says plainly
  that 100% is not the target.

## Coverage

Read in full or in the cited ranges: `docs/sre/core-app-slos.md`, `docs/runbooks/backup-and-dr.md`,
the prior SRE detail, `auth-telemetry.ts`, the `ProjectApplicationPage` submit path,
`ProjectFormPage` beacon, `web-vitals.ts` (head), `auth-prober/index.ts` and `alert.ts`,
`notify-critical-fix/index.ts`, the `techfleet-chat` degrade path, `braintrust.ts` enable gating,
the auth-email watchdog migration, `environment_readiness` (current definition),
`evaluate_system_health`, the cron recreation migration (job list), and the workflows
`config-preflight`, `incident-gate`, `main-failure-alert`, `deploy-migrations`. I also grepped
across `src/`, `supabase/`, and `.github/` for `record_event`, `p_kind`, burn rate and budget,
runbook links, push-log purges, and retention.

Not covered: all 28 runbooks individually; `ci-alert.yml`; `verify-deploy.yml` contents; the
System Health UI; the `email-pipeline-health` and `edge-deploy-smoke` alert paths; whether
`no-dropped-supabase-error` covers `supabase/functions`.

`check-alert-hygiene.mjs` does not apply here: the repo has no Prometheus-style alert-rule
directory. Alerts live in SQL and workflow YAML, and that is why SRE-9 proposes a custom check.

## Limitations

- This is static code only. There was no prod access, so cron job state, Vault and GitHub secrets,
  push subscriptions, PITR tier, Discord delivery history, and actual SLO attainment are
  **not-assessed**. A live dashboard or external uptime monitor could exist outside the repo.
  Nothing in the repo shows one.
- SRE-1 is inferred: a manual prod purge would weaken it.
- No tests were run. No `node_modules` were available, and running node guards was not needed for
  these findings.

## Evidence ledger (central claims)

| Claim | State | Source | Limitation |
|---|---|---|---|
| "We will be paged when sign-in breaks" | **inferred false on recurrence** (SRE-1), **observed fail-open** (SRE-2) | `notify-critical-fix/index.ts:41-121` | Prod purge or subscription state not-assessed |
| "Member SLOs are measured" | **observed: 1 of 4 full, 1 partial, 2 absent** | table above | none |
| "Burn-rate alerting exists" | **observed absent** | grep | Off-repo tooling not-assessed |
| "Backups are restorable" | **documented** (plan only) | `backup-and-dr.md:31-37` | PITR not-assessed |
| "Watchdogs are themselves watched" | **observed, but it skips green on missing secrets** | `config-preflight.yml:34-45` | Secret presence not-assessed |

Conformance vs adequacy: the SLO doc **conforms** to the skill's shape (SLI, SLO, window, budget,
policy, SEVs). It is **not adequate**, because the SLIs it defines are not emitted or computed, so
the budget policy cannot be applied.

**Open gaps (next measurements):** check the GitHub workflow-run history for `config-preflight`
(skipped or run); query `select count(*) from triage_critical_push_log where recipients_count=0`
in prod; query `select count(*) from push_subscriptions join user_roles ... role='admin'`; check
the Vault for `discord_alert_webhook`; check the PITR tier in the Supabase dashboard; do one
restore drill.

## Fixes: need NO prod access vs blocked

- **No prod access needed (repo-only PRs):** SRE-1 dedupe re-arm, SRE-2 fail-closed paging and
  Discord fallback, the SRE-3 workflow changes and guard, SRE-4 readiness row, SRE-6 ratio rewrite
  and revoke, SRE-7 journey emitters, SRE-8 rollup, SRE-9 runbook links and check, SRE-10
  templates and PRR, SRE-11 debounce.
- **Blocked on prod or human access:** setting the GitHub secrets so preflight and incident-gate
  really run (SRE-3 activation); the Vault webhook (SRE-4 activation); PITR confirmation and the
  restore drill (SRE-5); baseline latency targets (they need 2 weeks of data from SRE-7 or SRE-8
  in prod); a second on-call human (SRE-10).
