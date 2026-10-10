# SRE & Operational Readiness Audit — TechFleet Network

**Auditor stance:** skeptical SRE, production-readiness review. Scope: SRE dimension only
(SLIs/SLOs/error budgets, four golden signals, symptom-based alerting, dashboards, runbooks,
incident response, on-call, PRR). Read-only repo: `C:/Users/morga/Documents/tfn-audit`.
**Date:** 2026-10-09. Standard applied: `sre-operational-readiness/SKILL.md` + all 5 references,
`enterprise-architecture-standards/references/observability-operations.md`.

**Score: 61 / 100 — Band: 60–74 "adequate, material risk."**

The repo's self-claim of "strong error reporting" is *true and under-sold* — error handling is
genuinely enterprise-grade and mechanically enforced. But SRE is more than error logging, and the
**SRE spine the product's own roadmap depends on — defined member-facing SLOs with error-budget
burn-rate paging — is explicitly NOT built yet.** Paging today is static-threshold watchdogs to a
single human via a Discord webhook. That is the gap between "well-instrumented" and "operable."

---

## Evidence legend
Each finding: Evidence (file:line) · Re-runnable source · Evidence state
(VERIFIED = I read the exact code/doc; INFERRED = concluded from strong evidence; UNVERIFIED =
claimed, not confirmable statically) · named limitation.

---

## Weighted scorecard

| # | Sub-criterion | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | SLIs / SLOs / error budgets (defined for the live service) | 20% | 45 | 9.0 |
| 2 | Golden signals & observability (latency/traffic/errors/saturation, tracing, dashboards) | 20% | 62 | 12.4 |
| 3 | Alerting — symptom-based, no noise, burn-rate, actionable | 20% | 70 | 14.0 |
| 4 | Incident response / on-call / blameless postmortems | 15% | 48 | 7.2 |
| 5 | Runbooks & Production-Readiness Review | 15% | 68 | 10.2 |
| 6 | Self-healing / operability extras | 10% | 75 | 7.5 |
| | **Total** | 100% | | **60.3 → 61** |

---

## STRENGTHS (credit where earned)

### S1 — Error golden signal: exemplary and MECHANICALLY ENFORCED (VERIFIED)
`decisions.md §4` (lines 142–200) codifies "every failure reports," with **negative code examples**
and four fail-closed CI AST checks, not just prose:
- `scripts/ci/check-report-has-no-silent-drop.mjs` — a classifier "drop" branch must call
  `recordClassifiedDrop` before returning; a persistently-broken backend cannot masquerade as
  "transient" with zero signal (decisions.md:160–166, ADR-0031).
- `no-dropped-supabase-error` ESLint rule + shrink-only grandfather budget (decisions.md:170–186,
  ADR-0032) — a supabase read may not drop its `error`.
- `check-suppressforward-has-report.mjs` — logger silencing must pair with a real report
  (decisions.md:188–200, ADR-0033).
- `check-edge-audit-wrapper-coverage.mjs` — every edge entrypoint wrapped so an uncaught throw
  becomes an `edge_function_error` audit row **and** carries `x-trace-id` (decisions.md:229–244).

This is the single strongest part of the audit. The error signal is both instrumented *and*
protected against silent regression — rare even in large orgs.
Limitation: these guard the *client/edge* error path; they do not create SLO measurement.

### S2 — Correlation IDs are real (VERIFIED, boundary-level)
`x-trace-id` is attached to every browser→edge call and guaranteed on request/response via the
shared `withAuditWrapper` + `http.ts` (decisions.md:211, 229–230). Matches the skill's
"propagate a correlation ID into every log line."
Limitation: correlation ID only — there is **no distributed tracing (spans/timings)**. For a
Supabase + edge-function topology that is a smaller gap than for microservices, but "where in the
chain is the latency" is not answerable from telemetry.

### S3 — Symptom-based alerting done to textbook standard (VERIFIED)
`supabase/migrations/20260708200000_auth_email_watchdog.sql` is a model symptom alert:
- Alerts on the **user-facing symptom** — "≥3 email signups in 6h but 0 confirmation emails sent"
  (lines 52–58) — not a cause metric. "If the alert fires and users are fine, it shouldn't have
  paged" is satisfied.
- Fast/slow thresholds (6h vs 24h), **dedup** (max one Discord alert / 2h, lines 124–146) — anti-
  noise by design.
- **Fail-independent**: pure-DB (pg_cron, every 15 min, line 161), depends on none of
  email/web-push/edge deploys — it keeps working when those break. Born from a measured
  2.5-week silent outage (header lines 1–14). Records to `ops_events` even with no webhook (117).

`main-failure-alert.yml` (lines 39–42) **fails the run red** if `DISCORD_ALERT_WEBHOOK` is unset
rather than skipping silently — the skill's "never a silent skip" principle, encoded.
`ci-alert.yml` routes main-branch CI failures to `agent_fix_queue` (System Health → Triage) +
Discord.

### S4 — Runbooks: genuinely strong for a small team (VERIFIED)
26 version-controlled runbooks in `docs/runbooks/`, next to the code, including:
- `rollback.md` — tested, copy-pasteable paths for frontend (instant Cloudflare rollback), edge
  functions, auth-email hook (config rollback), DB (compensating forward migration — honest that
  there is "no automatic down-migration"), and dependency regressions. This is exactly the "tired
  on-call at 3 a.m." artifact the skill demands.
- `SECURITY_INCIDENT_RESPONSE.md` — severity triage table (first 5 min), secret rotation, session
  invalidation, hash-chain integrity verification, comms plan, PII handling. Strong.
- Per-dependency runbooks (groq-llm-outage, spf-sync-failure, email-subsystem-v2, etc.) with
  symptom → mitigate-first → diagnose → recover structure.

### S5 — SLO/error-budget *doctrine* is correct where it is written (VERIFIED)
`docs/sre/spf-handoff-slos.md` is textbook: availability/latency/correctness SLIs defined
"as close to the user as possible," explicit error budgets + spend policy, "100% is explicitly not
the target" (line 4), four-signal instrumentation plan, multi-window burn-rate alerting, SEV1–3.
The epic framing is intellectually honest: "zero member-facing incidents while unattended," not
"zero bugs" (`docs/epics/01-observability-and-retention.md:11–14`).

### S6 — Self-healing + readiness (VERIFIED)
`system_remediations` / `run_auto_remediations` auto-remediation engine
(`src/services/system-health.service.ts:122–142`); dependency-aware `environment_readiness()`
asserting critical DB objects exist
(`supabase/migrations/20260826140000_environment_readiness_critical_objects.sql:25,204`);
transient-retry wrappers. These reduce toil and MTTR.

---

## FINDINGS (ranked)

### CRITICAL
**C1 — Member-facing SLOs for the live product do not exist; the paging mechanism the roadmap
depends on is unbuilt.** (VERIFIED)
The only SLO artifact (`docs/sre/spf-handoff-slos.md`) covers the **SPF sync + hand-off pipeline**
— a future/Phase-0 subsystem ("Phase 0 governance artifact," "latency target to be set from the
Phase B2 load-test baseline"). For the **actual 767-user production app**, SLOs are explicitly
**planned, not done**: epic W2.3 "Define member-facing SLOs (login success rate, app-load success,
reset-email delivery, p95) and page **only** on breach" is marked ⬜ (planned)
(`docs/epics/01-observability-and-retention.md:125–126`). The epic's own Definition of Done — "a
genuinely novel break pages Morgan within minutes via an SLO breach" (line 148) — is therefore
**not yet satisfied**. Today's paging is static-threshold watchdogs, not error-budget burn on a
defined SLO.
*Impact:* no error budget → no objective ship/freeze decision rule; "is the app healthy from the
user's view?" has no measured answer for login, page-load, or email delivery.
*Smallest fix:* execute W2.1–W2.3 — one read model over `ops_events`/`ops_metrics`, define the 3–4
member SLIs from already-collected signals (`login_attempts.outcome`, `chunk_stale_log`,
`email_send_log`, `web_vital_samples`), set starting SLOs from measured baselines, and wire one
burn-rate alert.
*Re-runnable:* `rg -n "W2\.3|member-facing SLO" docs/epics/01-observability-and-retention.md`
*Limitation:* I audited docs/code statically; a dashboard/alert could exist in Supabase/Grafana
outside the repo. Nothing in-repo evidences it, and the epic marks it undone.

### HIGH
**H1 — No error-budget burn-rate alerting in production.** (VERIFIED) Burn-rate design exists only
on paper for SPF (`spf-handoff-slos.md:44–50`). Live alerts (auth_email_watchdog, main-failure-
alert) are static-threshold — good for hard-down, but they cannot catch a slow SLO erosion, and
there is no fast/slow multi-window burn policy tied to a budget. *Depends on C1.*
*Re-runnable:* `rg -ni "burn.?rate|error budget" supabase/ src/` → hits are SPF doc + prose only.

**H2 — Golden signals are uneven; traffic & saturation thin, no tracing.** (INFERRED from coverage)
Errors: excellent (S1). Latency: *partial* — `web_vital_samples` (7-day), `login_attempts.duration_ms`,
prober latency exist (`docs/epics/01...:49,74`; `src/lib/web-vitals.ts`) but no p95/p99 view tied to
a target. Traffic: *weak* — no explicit requests/sec or throughput SLI for the app. Saturation:
*partial* — email queue depth (`EmailQueueStat`, system-health.service.ts:37–45), Groq rate-limit
headroom, DB pool implied; not systematically dashboarded for the core app. No span-level tracing.
*Impact:* saturation "predicts imminent failure" — without it you detect overload only after users
feel it (the PGRST002 "DB overload" class, ranked risk #3, is reactive). *Smallest fix:* add a
golden-signal-organized dashboard panel (traffic + p95 latency + saturation) alongside the existing
error/email panels.

**H3 — On-call is a single human + a webhook; no rotation, escalation, or role separation.**
(VERIFIED/INFERRED) "Page a human" = a Discord webhook to the maintainer (auth_email_watchdog
lines 131–143; main-failure-alert). No rotation (skill floor 6–8 people), no escalation policy
(primary→secondary→manager), no IC/Comms/Scribe separation for non-security incidents. Honest for
a solo-maintained project, but a material operational risk: a real 2 a.m. outage has one point of
human failure and no backup if that person is unreachable.
*Smallest fix:* document the accepted single-maintainer risk explicitly in a PRR, add at least a
second notification target / backup contact and an ack-timeout escalation.

### MEDIUM
**M1 — No blameless-postmortem process, template, or archive.** (VERIFIED) No postmortem doc,
template, or directory exists (`find docs -iname "*postmortem*"` → none; only
SECURITY_INCIDENT_RESPONSE.md). Incidents are captured informally in runbook/migration headers and
epic prose. *Partial credit:* incident→regression-test *is* enforced via `incident-gate.yml` +
`known_issue_catalog` (every resolved fingerprint locked by a tagged scenario) — the "turn
incidents into regression tests" practice is real. But there is no structured timeline/impact/
action-item-tracked postmortem; action items are not tracked to completion as a process.

**M2 — DB-backed gates skip green when secrets unset (possible alerting/incident theater).**
(VERIFIED) `incident-gate.yml:59–72` self-heals to green when `SUPABASE_SERVICE_ROLE_KEY` is unset;
the epic confirms gates "skip-green when Supabase env is unset — so on the migrated project they may
be running as theater" and lists repointing CI vars as outstanding Cowork work
(`docs/epics/01...:90–91, 101, 139`). So the regression-recurrence guard may currently be inert on
the live project. *Smallest fix:* complete W0.2 (point CI vars/secrets at project
`pzvqxdgoztbfikfuifix`); verify incident-gate actually runs.

**M3 — No formal Production-Readiness Review (PRR) gate.** (VERIFIED) Pieces are scattered
(`enterprise-readiness-brief.md`, `spf-handoff-slos.md`, rollback runbook) but there is no single
PRR checklist that must pass before a service takes traffic. `enterprise-readiness-brief.md:224`
even flags an open DR gap ("confirm PITR… *test a restore*; write a DR runbook").

### LOW
**L1 — Several runbooks are skeletons with TODOs.** (VERIFIED) `groq-llm-outage.md:29`
("_TODO (Phase B2): kill-switch location, queue table, resume command_"); handoff runbooks marked
"Skeleton (finalized in Phase B2)." The skill warns "a stale runbook that lies is worse than none."
Low because they are honestly labeled skeletons for a not-yet-launched subsystem.

**L2 — Dashboard is error/email/KPI-organized, not golden-signal-organized.** (VERIFIED) The System
Health admin page (`src/pages/SystemHealthPage.tsx`, `system-health.service.ts`) surfaces top error
fingerprints, email-pipeline health, remediations, and "Refactor KPIs" — a real operational
dashboard, but not the skill's "four golden signals + SLO attainment + budget burn + deploy
annotation" layout. No deploy-annotation overlay to answer "did this get worse right after a
release?"

---

## Bottom line
Foundations an SRE would be glad to inherit: an error signal that is enforced against silent
regression, correlation IDs, a textbook symptom-based fail-independent watchdog, loud-by-default CI
alerting, a tested rollback runbook, and 26 version-controlled runbooks. What keeps this at
"adequate, material risk" rather than enterprise-ready is that the **measured, user-centric core of
SRE is not yet wired for the live app**: no defined member-facing SLOs, no error-budget burn-rate
paging (both explicitly roadmapped-but-unbuilt), uneven saturation/traffic/tracing coverage, and a
single-human on-call with no postmortem process. The team clearly *knows* the standard — the SPF
SLO doc and the epic prove it — so this is an execution gap, not a knowledge gap.

**Biggest limitation of this audit:** static read-only of the repo on a feature branch. Live
Supabase dashboards, pg_cron job state, Grafana/UptimeRobot-style external monitors, or the actual
Discord alert history could exist outside the tree and would raise several scores; nothing in-repo
evidences them, and the epic's own ⬜ markers corroborate the gaps.
