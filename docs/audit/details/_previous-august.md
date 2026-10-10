# Normalized inventory — TechFleet Network AUGUST 2026 audit

Extracted for diff against the October 2026 audit. Scope: August docs only (April PDF and
pentest-report excluded). Source docs:

- SEC = `docs/audits/full-system-audit-2026-08.md` (adversarial security & quality audit, 2026-08-08)
- SH  = `docs/audits/system-health-enterprise-audit-2026-08.md` (System Health subsystem, 2026-08-08)
- FA  = `docs/architecture/audit-2026-08/findings.md` (architecture per-section audit, 837 findings; IDs below use `FA-L<line>` = source line in that file)
- FH  = `docs/architecture/audit-2026-08/findings-high.md` (the High subset of FA, 179 items — same findings, not double-counted)
- RF  = `docs/architecture/audit-2026-08/review-followups.md` (findings raised during remediation)
- STAT= `docs/security/audit-2026-08-16.md` (static whole-codebase security audit, 2026-08-16)

ID scheme: SEC docs keep native IDs (C1, H1, T-A…, P0-1…). Architecture findings use `FA-L<line>`
(stable, re-derivable from the source line). Dimensions mapped to: Architecture, Security/OWASP,
Database, Testing, Release/Deploy, SRE/Ops, Compliance/Data-lifecycle, ADR/Docs, Quality-gates, Other.

---

## August overall scores / grades (verbatim)

**SEC — full-system adversarial audit (2026-08-08)**

Counts after dedup/merge: **Critical (P0) = 3**, **High = 15**, **Medium ≈ 30**, **Low ≈ 16**, **Info = 3**.
(Round-1 Fleety/Freescout sub-pass: 2 P0/Critical, 8 High, ~10 Med, ~13 Low.)

Per-skill compliance scorecard (full-system):
- owasp-secure-coding-bdd — **FAIL**
- enterprise-architecture-standards — **FAIL**
- comprehensive-test-strategy — **FAIL**
- compliance-data-lifecycle — **FAIL**
- release-deployment-safety — **FAIL**
- sre-operational-readiness — **PARTIAL→FAIL**
- Net verdict: **"6/6 fail or effectively fail. The testing/CI failures are the force multiplier."**

Round-1 provisional scorecard: owasp 🔴 Fail; comprehensive-test 🔴 Fail; compliance 🟠 Partial→Fail;
release-safety 🟠 Partial; sre 🟠 Partial; enterprise-arch 🟠 Partial.

**SH — System Health enterprise-readiness audit (2026-08-08)**

No single letter grade. Unifying root cause: *"the monitors' own liveness is unmonitored, and the one
readiness gate is too narrow to notice."* Severity tally: 4 P0, 11 P1, 10 P2, 8 P3, plus 9 cross-lens
convergence findings (C1–C9). Lenses applied: SRE, release-safety, comprehensive-test, enterprise-arch,
owasp, compliance.

**FA — architecture per-section audit (main 9d772cd)**

**837 verified findings across 46 sections. Severity: 179 High · 430 Medium · 228 Low.** Each CONFIRMED
or PLAUSIBLE (adversarially re-checked). No letter grade.

**STAT — static security audit (2026-08-16, main c5d48c40)**

**Verdict: "clean."** OWASP SAST 49/49 pass; OWASP 120-sheet coverage 120/120 mapped; committed-secret
scan clean (2,272 files); prod deps 0 high / 0 moderate / 2 low. Only open item: `quill`/`react-quill-new`
XSS-on-export (low, no upstream fix, mitigated by DOMPurify).

**Already-claimed-resolved since August:** RF-01…RF-04 (all `fixed`, in review-followups.md). The STAT
doc notes dev-only vite(high)/esbuild(moderate) advisories are remediated by PR #224. Everything in SEC,
SH, and FA is reported OPEN at audit time (no fix claimed in the August docs themselves).

---

## Table 1 — SEC: full-system adversarial security & quality audit

| ID | Title | Severity | Dimension | Aug-status | Source | Description |
|---|---|---|---|---|---|---|
| C1 | Systemic unsigned-JWT service_role bypass | Critical/P0 | Security/OWASP | open | SEC §2 | `_shared/service-role-auth.ts:47` base64-decodes JWT payload and trusts `role==="service_role"` without signature verification; 4 inline copies; ~19 `verify_jwt=false` fns reachable. `auth.test.ts:41` encodes the forged token as correct. |
| C2 | fleety-learning-digest anon-key substring bypass | Critical/P0 | Security/OWASP | open | SEC §2 | Guard uses `.includes(ANON_KEY)` — anon key is public; any user sends `Bearer <anon_key>` to run as service role (wipe insights, auto-promote canned answers). |
| C3 | Freescout customer_user_id FK↔RLS contradiction | Critical/P0 | Database | open | SEC §2 | FK→`profiles(id)` but RLS filters `=auth.uid()`; support ticketing broken end-to-end (FK violations, invisible pointers, duplicate tickets). |
| H1 | Turnstile "always-passes" test-secret bypass | High | Security/OWASP | open | SEC §3 | `isProductionOrigin()` from omittable Origin/Referer; no Origin → test secret passes CAPTCHA for scripted flows. |
| H2 | project_roster RLS `USING(true) TO authenticated` | High | Database | open | SEC §3 | All 767 users can read members' email, performance_notes, hours, mentor (Confidential eval data). |
| H3 | try_write_audit_log has no CREATE FUNCTION | High | Release/Deploy | open | SEC §3 | No `CREATE FUNCTION` in any migration; `db reset` aborts → DB unbuildable from source → DR/cutover broken. |
| H4 | migration-smoke force-disabled (`&& false`); skip counts as pass | High | Quality-gates | open | SEC §3 | `ci.yml:376`; no migration/RLS change ever executed before merge; `db reset` "has never passed." |
| H5 | withIdempotency cross-user cache replay | High | Security/OWASP | open | SEC §3 | `requestHash=method:path:body` with no user id; RPC ignores `p_user_id`; another user's X-Request-Id+body returns cached private response. |
| H6 | Untrusted RAG concatenated into Fleety system prompt | High | Security/OWASP | open | SEC §3 | KB rows/few-shot/examples placed after base instructions with no untrusted delimiter → persistent cross-user prompt injection. |
| H7 | Fleety cross-user PII cache leak | High | Security/OWASP | open | SEC §3 | Response cache not keyed per user; personalized grounded answer replayed to next member. |
| H8 | send-announcement-email non-idempotent mass duplicate blast | High | SRE/Ops | open | SEC §3 | Fresh messageId per recipient per run + cap exemption; retry re-blasts all 767; unbounded serial fan-out, no cursor. |
| H9 | transactional-email writes full rendered email + PII into email_send_log.metadata | High | Compliance/Data-lifecycle | open | SEC §3 | html/text/subject + templateData logged long-lived, broadly read, no retention; survives GDPR erasure. |
| H10 | gumroad-webhook lifecycle events silently dropped | High | SRE/Ops | open | SEC §3 | refund/dispute/cancel UPDATE returns 200 on 0 rows → refunded buyer keeps membership forever. |
| H11 | resolve-discord-id identity binding without ownership proof | High | Security/OWASP | open | SEC §3 | Confirm branch writes any guild member's discord_user_id onto caller; attacker claims admin's snowflake. |
| H12 | confirm-admin-role promotion token never expires | High | Security/OWASP | open | SEC §3 | No expires_at/time filter; highest-priv grant outlives leaked email indefinitely. |
| H13 | confirm-teacher-role plaintext, forever-valid token | High | Security/OWASP | open | SEC §3 | Reads/writes plaintext `.eq('token',…)`; regression of the admin-table hardening. |
| H14 | edge-deploy-smoke alert writes non-existent audit_log columns | High | SRE/Ops | open | SEC §3 | action/resource_type/resource_id/metadata don't exist; insert throws unchecked → silent-deploy safety net is a no-op. |
| H15 | translate-strings unauth LLM spend | High | Security/OWASP | open | SEC §3 | verify_jwt=false, only checks `Bearer ` prefix; uncapped Gemini spend drains shared LOVABLE_API_KEY. |
| T-A | profiles.id vs auth.uid() confusion (theme) | Medium | Database | open | SEC §4 | record_policy_ack 0-row update (consent never persisted); notifications keyed to prof.id invisible; GDPR anonymize no-ops. |
| T-B | Schema drift → silent-failure writes (theme) | Medium | Database | open | SEC §4 | notifications.{body,link,category} and audit_log columns don't exist; PGRST204 swallowed → members/admins never notified. |
| T-C | Client-controlled headers trusted for security (theme) | Medium | Security/OWASP | open | SEC §4 | XFF leftmost used for rate-limit bucket + audit ip; Content-Length trusted before buffering public bodies (DoS). |
| T-D | Stored XSS/HTML injection into notifications (theme) | Medium | Security/OWASP | open | SEC §4 | mark-interview-scheduled raw applicantName into title; quest-nudge raw path_title into body_html. |
| T-E | RAG / prompt-injection hardening gaps (theme) | Medium | Security/OWASP | open | SEC §4 | injection scan logs only; no similarity floor; per-chunk sanitize; unsanitized Figma/CSV ingest into KB. |
| T-F | Reliability/idempotency/silent loss (theme) | Medium | SRE/Ops | open | SEC §4 | dedupe-before-enqueue drops events; one-shot flags stamped on failure; TOCTOU rate limits; DLP `/g` lastIndex bug; WAF decodeURIComponent throws. |
| T-G | Account enumeration & auth-flow weaknesses (theme) | Medium | Security/OWASP | open | SEC §4 | check-account-identity oracle; delete-account no last-admin guard; broker reset doesn't revoke sessions; teacher mutations lack 2FA step-up; GET confirm prefetch. |
| T-H | Unauth abuse / cost / DoS on public & privileged endpoints (theme) | Medium | Security/OWASP | open | SEC §4 | submit-dispute unauth; record-web-vital write-amp; i18n/translate cost; sync-airtable IDOR; no-timeout Discord fetches; gumroad raw payload retention. |
| SEC-LOW | Low-severity group (~16) | Low | Security/OWASP | open | SEC §5 | Error-detail leakage (A09); non-constant-time secret compares; spoofable audit IP; isolate-local rate limits; sensitive-data logging; unbounded fan-out; PII over-exposure; latent duplicate send; input validation; Discord interaction replay; CORS wildcard on privileged Discord endpoints. |
| SEC-INFO | Info group (3) | Info | Other | open | SEC §5 | Unsanitized ticket subject into templateData; loadKnowledgeBase per /fleety call; service-role-auth corroboration (folded into C1). |

---

## Table 2 — SH: System Health enterprise-readiness audit

| ID | Title | Severity | Dimension | Aug-status | Source | Description |
|---|---|---|---|---|---|---|
| SH-C1 | reconcile-stuck-emails cron never recreated post-cutover | P0 | SRE/Ops | open | SH §2/§3 | 336 stuck emails; card frozen ~2 months; last_run_at frozen, nothing drains queue. |
| SH-C2 | environment_readiness checks only 5 of ~20 crons | P1 | SRE/Ops | open | SH §2 | config-preflight.yml inherits the hole; never-scheduled jobs invisible. |
| SH-C3 | Alert delivery path is dead | P0 | SRE/Ops | open | SH §2/§3 | triage-critical-push not recreated; auth-prober invokes nonexistent fn; edge-deploy-smoke writes nonexistent audit_log cols. |
| SH-C4 | last_run_at staleness never an alarm | P2 | SRE/Ops | open | SH §2 | UI hardcodes "runs every 5 min"; tones only on stuck>0. |
| SH-C5 | Health RPCs DISTINCT ON full-scan email_send_log before windowing | P1 | Database | open | SH §2/§3 | Prior statement_timeout incident; O(total-rows) sort per 5-min poll per admin; won't survive 10k users. |
| SH-C6 | RPC↔service↔UI shape drift | P2 | Testing | open | SH §2 | marked_dlq vs dlq_lost; requeued not produced; papered over client-side; no contract test. |
| SH-C7 | Other cutover-orphaned crons dead | P1 | Compliance/Data-lifecycle | open | SH §2 | retention, purge_old_audit_logs, ops_events expiry, environment-readiness never scheduled. |
| SH-C8 | Auth divergence across edge fns + wildcard CORS | P2 | Security/OWASP | open | SH §2 | One hand-rolled non-constant-time compare; 3 admin-auth idioms; ACAO:*. |
| SH-C9 | VALID_HEALTH_TABS drifts from rendered tabs | P3 | SRE/Ops | open | SH §2 | Deep-links silently fall back to queues. |
| SH-P0-1 | Reconciler cron missing (=C1) | P0 | SRE/Ops | open | SH §3 | Add to canonical registry, idempotent, drain backlog. |
| SH-P0-2 | Alert delivery path dead (=C3) | P0 | SRE/Ops | open | SH §3 | Synthetic probes record failures and page no one. |
| SH-P0-3 | Right-to-erasure not executable + conflicts with append-only audit | P0 | Compliance/Data-lifecycle | open | SH §3 | No erasure executor RPC; handle_user_deletion DELETEs audit_log which append-only trigger rejects → whole tx rolls back. |
| SH-P0-4 | audit_log has no working retention AND is sampled | P0 | Compliance/Data-lifecycle | open | SH §3 | purge scheduled by no cron + blocked by trigger; audit.ts drops events under load. |
| SH-P1-1 | Readiness gate + drift CI cover ~25% of crons | P1 | Quality-gates | open | SH §3 | Hardcoded 5-job list; CI drift-detector structurally cannot catch C1. |
| SH-P1-2 | No SLIs/SLOs/error budgets anywhere | P1 | SRE/Ops | open | SH §3 | Health is categorical prose; failure rate never compared to a target; no burn-rate. |
| SH-P1-3 | Health RPCs full-scan email_send_log (=C5) | P1 | Database | open | SH §3 | Push time predicate into base CTE; add indexes / read-model. |
| SH-P1-4 | run_auto_remediations() callable by any authenticated user | P1 | Security/OWASP | open | SH §3 | SECURITY DEFINER, GRANT EXECUTE TO authenticated, no has_role gate. |
| SH-P1-5 | Retention engine dead post-cutover | P1 | Compliance/Data-lifecycle | open | SH §3 | enforce_retention_policy + ops_events 90-day expiry scheduled only pre-cutover; PII accumulates unbounded. |
| SH-P1-6 | Retention/incident audit events silently never written | P1 | Compliance/Data-lifecycle | open | SH §3 | INSERT into nonexistent audit_log columns wrapped in EXCEPTION WHEN OTHERS THEN NULL. |
| SH-P1-7 | Unmasked recipient PII in admin UI + email_send_log no retention | P1 | Compliance/Data-lifecycle | open | SH §3 | Full addresses rendered; no masking/read-audit; no TTL. |
| SH-P1-8 | No backup/DR/RPO-RTO for audit + PII data | P1 | Compliance/Data-lifecycle | open | SH §3 | No PITR/backup config in-repo post-cutover; no restore drill. |
| SH-P1-9 | Migration replay broken: infra referenced before it exists | P1 | Release/Deploy | open | SH §3 | 20260707200000 reads cron.job/pgmq/net before the IaC migration; manual "CREATE EXTENSION by hand" step. |
| SH-P1-10 | Dual email deploy paths; replay resurrects the retired one | P1 | Release/Deploy | open | SH §3 | Registry unconditionally recreates legacy process-email-queue cron (double-send risk). |
| SH-P1-11 | Test strategy is an "ice-cream cone" of source-string asserts | P1 | Testing | open | SH §3 | smoke test greps files (passes while cron absent); no pgTAP; db-test non-blocking; no contract tests. |
| SH-P2-1 | get_email_reconciler_status leaks ops data to all authenticated users | P2 | Security/OWASP | open | SH §3 | No admin gate, GRANT authenticated. |
| SH-P2-2 | write_audit_log GRANTed to authenticated → Top-Errors injection | P2 | Security/OWASP | open | SH §3 | Any user inserts *_pipeline_unhealthy rows (append-only, permanent). |
| SH-P2-3 | No single source of truth for "health" | P2 | Architecture | open | SH §3 | Status computed in RPC and stored in system_health_state.status; UI ignores the row. |
| SH-P2-4 | SystemHealthPage is a 23-tab god component | P2 | Architecture | open | SH §3 | ~15 bounded contexts in one ~391-line file. |
| SH-P2-5 | Probes lack timeouts / circuit breakers | P2 | SRE/Ops | open | SH §3 | auth-prober fetch no AbortSignal; email-pipeline-health RPCs untimed. |
| SH-P2-6 | Duplicated/inconsistent auth + wildcard CORS (=C8) | P2 | Security/OWASP | open | SH §3 | Hand-rolled non-constant-time !==; 3 idioms; ACAO:*. |
| SH-P2-7 | Two overlapping DLQ-replay functions; one mis-tagged | P2 | Architecture | open | SH §3 | replay-email-dlq (cron) vs replay-dlq-emails (admin-JWT, tagged @edge-cron). |
| SH-P2-8 | No load/perf, chaos, coverage, or mutation gates | P2 | Testing | open | SH §3 | No perf baseline; no fault injection; no coverage thresholds; drift gates self-skip green. |
| SH-P2-9 | ops_events expiry decorative; verify_audit_chain never run; write_audit_log trusts caller user_id | P2 | Compliance/Data-lifecycle | open | SH §3 | — |
| SH-P2-10 | Self-healing + watchdog restored but unmonitored | P2 | SRE/Ops | open | SH §3 | Watchdog pages only to one optional Discord webhook with silent-null fallback. |
| SH-P3-1 | VALID_HEALTH_TABS drift (=C9) | P3 | SRE/Ops | open | SH §3 | Deep-links fall back to queues. |
| SH-P3-2 | Hardcoded project URL/domains | P3 | ADR/Docs | open | SH §3 | Should source from Vault/env. |
| SH-P3-3 | generatedAt client-clock fallback | P3 | SRE/Ops | open | SH §3 | Can render "Updated just now" on a stale/failed snapshot. |
| SH-P3-4 | No correlation-ID trace across email pipeline | P3 | SRE/Ops | open | SH §3 | Not threaded enqueue→dispatch→send_log. |
| SH-P3-5 | Reconciler not idempotent under concurrent runs | P3 | SRE/Ops | open | SH §3 | Manual "run now" during scheduled run could double-append terminal rows. |
| SH-P3-6 | Incident-response assets thin | P3 | SRE/Ops | open | SH §3 | No SEV levels / on-call / postmortem template; runbooks not linked from alerts. |
| SH-P3-7 | DSAR intake has no notification/SLA alert | P3 | Compliance/Data-lifecycle | open | SH §3 | 30-day SLA depends on an admin watching the tab. |
| SH-P3-8 | Stale auth comments in auth-prober/reconcile-stuck-emails | P3 | ADR/Docs | open | SH §3 | Claim a JWT path the shared helper no longer accepts. |

---

## Table 3 — STAT: static whole-codebase security audit (2026-08-16)

| ID | Title | Severity | Dimension | Aug-status | Source | Description |
|---|---|---|---|---|---|---|
| STAT-1 | OWASP static SAST sweep | — | Security/OWASP | pass (49/49) | STAT | Whole repo: src, 128 edge fns, 683 migrations, scripts, docs, workflows. |
| STAT-2 | OWASP 120-sheet coverage | — | Security/OWASP | pass (120/120) | STAT | All cheat sheets mapped. |
| STAT-3 | Committed-secret scan | — | Security/OWASP | clean | STAT | 2,272 files. |
| STAT-4 | Dependencies (production) | Low | Security/OWASP | 0 high / 0 mod / 2 low | STAT | Only quill lows. |
| STAT-5 | quill / react-quill-new XSS on HTML export | Low | Security/OWASP | accepted (no upstream fix) | STAT | GHSA-v3m3-f69x-jf25; mitigated by central DOMPurify sanitizer. |
| STAT-6 | dev-only vite (high) + esbuild (moderate) advisories | High/Mod (dev) | Release/Deploy | remediated by PR #224 | STAT | vite 5→7 upgrade; after merge only the two quill lows remain. |

NOTE: STAT's "clean" verdict directly contradicts SEC/SH/FA, which found live P0s. STAT is static
pattern-based and missed the logic/auth-flow defects (e.g. C1 unsigned-JWT fallback passed its SAST).
Flag this contradiction when comparing to October.

---

## Table 4 — RF: review follow-ups (raised during remediation)

| ID | Title | Severity | Dimension | Aug-status | Source | Description |
|---|---|---|---|---|---|---|
| RF-01 | listFactors() could re-seed factorCache after sign-out reset (re-opens P35) | Medium | Security/OWASP | **fixed (#306)** | RF | Generation counter in mfa.service.ts; regression test added. |
| RF-02 | signOut didn't clear MFA cache (rode solely on SIGNED_OUT event) | Low | Security/OWASP | **fixed (#306)** | RF | Added defensive clearAllMfaClientState() to both imperative paths. |
| RF-03 | auth-mfa recentlyVerifiedAt quiet window survived sign-out | Low | Security/OWASP | **fixed (#306)** | RF | Reset on every sign-out via resetMfaQuietWindowForSignOut(). |
| RF-04 | check-no-opaque-script-error.mjs wired into no workflow (dead monitor) | Medium | Quality-gates | **fixed** | RF | Deleted dead monitor; proved real owner (BEFORE INSERT trigger) with pgTAP; ADR-0024. Established standing "gate integrity / no false-positive checks" rule. |

---

## Table 5 — FA: architecture per-section audit (837 findings)

All CONFIRMED unless marked (PLAUSIBLE) or (added-in-verification). All OPEN at audit time.
Dimension tag: sec=Security/OWASP; boundary/ownership/dependency/error-handling/under-eng/over-eng/other
= Architecture (the four-questions tags). ID = source line in findings.md.

### Auth, account, onboarding, journey & dashboard pages
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L59 | High | sec | C | WelcomeWizard writes profiles directly, bypassing ProfileService sanitization + allow-list (stored XSS / mass assignment) |
| FA-L64 | High | error-handling | C | ThirdStepsPage writes journey_progress directly; uncomplete hits BEFORE-UPDATE guard, silently diverges UI from DB |
| FA-L69 | High | ownership | C | Two onboarding wizards write overlapping profile fields with two different 'onboarded' signals |
| FA-L74 | High | boundary | C | DashboardPage queries projects and clients tables directly in an inline queryFn, dropping errors |
| FA-L79 | Med | ownership | C | Dashboard self-heals connect-discord task from profile.discord_user_id — data-ownership conflict patched in React |
| FA-L84 | Med | error-handling | C | Discord OAuth callback treats post-link finalize failure as a link failure — user retries an already-linked account |
| FA-L89 | Med | boundary | C | ProfileSetup onboarding workflow trapped in submit handler with floating Discord promises, no retry idempotency |
| FA-L94 | Med | dependency | C | EditProfilePage calls export_my_data RPC and delete-account edge directly from the component |
| FA-L99 | Med | error-handling | C | FirstStepsPage progress load has no error handling — failed fetch shows completed user as blank, can re-fire notifications |
| FA-L104 | Med | error-handling | C | WelcomeWizard marks onboarded_at without checking the write — 'Welcome aboard' but DB not updated, bounce loop |
| FA-L109 | Med | error-handling | C | Phase-completion Discord announcements not idempotent, computed from stale closure state |
| FA-L114 | Med | error-handling | P | DashboardPage renders infinite skeleton with no error/retry when overview RPC or counts fail structurally |
| FA-L119 | Med | ownership | C | WelcomeWizard onboarding never satisfies FirstSteps 'profile' task, so /welcome users re-prompted |
| FA-L124 | Low | other | C | navigate() called during render in QuestDetailPage and WelcomeWizard |
| FA-L129 | Low | under-eng | C | ConfirmAdminPage and ConfirmTeacherPage near-identical duplicated files |
| FA-L134 | Low | other | C | Membership 'waitlist' action shows success toast but persists nothing |
| FA-L139 | Low | over-eng | C | WelcomeWizard fetches/stores readiness never rendered, no-op canAdvance, unused label maps |
| FA-L144 | Low | under-eng | C | ThirdStepsPage hand-rolls a markdown parser inside the component |
| FA-L149 | Low | dependency | C | DashboardPage imports data constants from sibling page modules, undermining code-splitting |
| FA-L154 | Low | other | C | (profile as any) casts in ProfileSetup/EditProfile suppress type-checking on typed fields |
| FA-L159 | Low | under-eng | C | Inconsistent lazy-loading and edge-invocation abstractions across the section |
| FA-L164 | Low | under-eng | C | NotFound uses full-page anchor reload and has a dead useLocation call |

### Projects, clients, applications & roster pages
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L173 | High | boundary | C | Project-edit autosave writes UNVALIDATED full form state onto the live projects row every 30s |
| FA-L178 | High | error-handling | C | Project-application create flow has no idempotency — duplicate rows break .single()/.maybeSingle() reads |
| FA-L183 | Med | sec | P | Admin application-review page has no in-component authorization, leans on client AdminRoute + unverified RLS |
| FA-L188 | Med | error-handling | C | bounded-save probe compares projects.name (never set by form) — indeterminate save never resolves to 'persisted' |
| FA-L193 | Med | under-eng | C | Admin roster applicant counts under-count once completed apps exceed PostgREST row cap |
| FA-L198 | Med | boundary | C | Systemic layering violation: project/client/application table access inlined into ~8 pages |
| FA-L203 | Med | dependency | C | Two pages hand-roll raw fetch() to edge functions with duplicated env/apikey wiring |
| FA-L208 | Med | error-handling | C | Course prerequisite check is a floating promise with no catch — strands page on 'loading' |
| FA-L213 | Med | error-handling | C | Bulk ingest shows green success toast even when every dataset failed |
| FA-L218 | Med | error-handling | C | Confirmation email keyed off stale React state, not the insert's returned id — first-timer silently gets no email |
| FA-L223 | Med | ownership | P | ProjectFormPage edit mode has no lost-update protection — full-row autosave clobbers concurrent editor |
| FA-L229 | Low | error-handling | C | Multi-step navigation advances UI before save resolves (optimistic step change on failable mutation) |
| FA-L234 | Low | error-handling | C | Fire-and-forget Discord notification with no error handling |
| FA-L239 | Low | under-eng | C | Chained enabled-gated queries create a load waterfall on hot applicant/admin pages |
| FA-L244 | Low | sec | C | Admin/status pages over-fetch profiles with select('*'), shipping every column to client |
| FA-L249 | Low | under-eng | C | Clients/Projects tab switch overwrites query string, dropping other search params |
| FA-L254 | Low | under-eng | C | Dead imports/state in ApplicationsPage |
| FA-L259 | Low | over-eng | C | ProjectFormPage runs same fetch twice + initializes form state during render |
| FA-L264 | Low | error-handling | P | Project application submittable to a project no longer accepting applications — submit never re-checks status |

### Classes, cohorts, curriculum & course pages
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L274 | High | dependency | C | UI component reaches past hooks/services straight into DB for an authorization decision (ClassDetailPage isEnrolled) |
| FA-L279 | High | ownership | C | Prerequisites have two writers; autosave persists stale loaded list, silently drops owner's edits |
| FA-L284 | High | ownership | C | Class autosave writes owner's unvalidated form buffer over a class under review/published via stale cached status |
| FA-L289 | High | ownership | C | Owner can silently mutate a PUBLISHED class with no re-review — 'published' missing from autosave exclusion list |
| FA-L295 | High | under-eng | C | Three class columns exist only as inline `as {...}` casts — a rename drops learner content with no type error |
| FA-L300 | Med | boundary | C | Numeric capacity autosaved as raw string, bypassing zod coercion |
| FA-L305 | Med | error-handling | C | Registration-click analytics is a floating promise with swallowed error and silent no-user return |
| FA-L310 | Med | under-eng | C | N+1 audit-history query: one PostgREST round-trip per draft row in the grid |
| FA-L315 | Med | ownership | C | Approve invalidates only classes cache, leaving cohort lists stale after cohorts go live |
| FA-L320 | Med | ownership | C | submitCohort refreshes only classes cache — cohort keeps showing 'draft' with Submit button |
| FA-L326 | Med | error-handling | C | Status emails fire-and-forget: approve/submit/changes/archive succeed but notification failure invisible |
| FA-L331 | Med | ownership | C | Cohort autosave permitted while status=pending_review lets owner mutate a cohort mid-review |
| FA-L336 | Med | sec | P | Curriculum visibility is a client-only gate derived from stale time-lagged enrollment cache |
| FA-L341 | Low | over-eng | C | Two service methods wrap same submit RPC with divergent side effects — cohort submit sends no email |
| FA-L346 | Low | under-eng | C | TrainingPage mount fires ~11 independent per-user queries that could be batched |
| FA-L351 | Low | error-handling | C | Cohort form onSubmit swallows every handleSubmit rejection |
| FA-L356 | Low | under-eng | C | Admin search re-parses every class's HTML summary via DOM on each keystroke |
| FA-L361 | Low | other | C | 'Needs attention' bucket and changes-requested chip use two different definitions |
| FA-L366 | Low | other | C | Dead viewer-completed parameter threaded through completers formatter |

### Community, events, resources, notifications & Fleety pages
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L375 | High | sec | C | Direct profiles writes from UI bypass ProfileService XSS sanitization + mass-assignment allow-list (NotificationSettings) |
| FA-L380 | High | error-handling | C | ChatPage persists conversations/messages with direct DB calls and zero error handling — silent total chat loss |
| FA-L385 | Med | boundary | C | Chat persistence lives in UI component instead of hook/service |
| FA-L390 | Med | ownership | C | Conversation updated_at written from client clock, racing the DB and reordering history |
| FA-L395 | Med | under-eng | C | Hand-rolled SSE parser duplicated across four surfaces; unparseable frame stalls the stream |
| FA-L400 | Med | ownership | C | Events timezone stored in both localStorage and profile, localStorage silently winning forever |
| FA-L405 | Med | other | C | Unfiltered realtime subscription triggers support-query invalidation storm at scale |
| FA-L410 | Med | error-handling | C | Announcement media uploaded before create; failed create orphans video/audio in storage |
| FA-L415 | Med | ownership | C | Read-modify-write of notification_prefs JSON blob loses concurrent toggles |
| FA-L420 | Med | error-handling | C | navigate() handed untrusted data-driven link_url, mishandles external URLs |
| FA-L425 | Med | error-handling | C | Prerequisite fetch has no catch — page hangs on 'loading' + unhandled rejection |
| FA-L430 | Med | under-eng | C | Report panels hand-roll CSV export, duplicated with no field escaping (CSV/formula injection) |
| FA-L435 | Med | error-handling | C | createConversation succeeds but unchecked user-message insert leaves empty ghost conversation |
| FA-L441 | Med | other | C | Realtime handler invalidates entire 'support' query prefix, amplifying refetch storm |
| FA-L447 | Low | under-eng | C | React Query 'refresh' by mutating the queryKey — unbounded cache growth |
| FA-L452 | Low | ownership | P | Marketing opt-in state is a local mirror of Email Octopus with a known drift window |
| FA-L457 | Low | error-handling | C | Feedback submit fires Discord notification as unawaited, uncaught promise |
| FA-L462 | Low | under-eng | C | Member and admin feedback forms duplicate same submit/validation logic |
| FA-L467 | Low | boundary | C | Direct table read (support_categories) and rpc from inside a page component |
| FA-L472 | Low | under-eng | C | Reopened conversations lose feedback attribution and sources (turnId/sources not persisted) |
| FA-L477 | Low | over-eng | C | Fragile single-boolean guard patched over the 'history disappeared' bug |

### Admin, system-health, design, legal & consent pages
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L486 | High | ownership | C | Legal 'Effective' date is a hardcoded literal that duplicates policy_versions.effective_at |
| FA-L492 | High | under-eng | C | SystemHealthPage: three tabs unreachable — allow-list omits 'reset','auth-funnel','edge-functions' |
| FA-L498 | High | boundary | C | ActivityLog severity/layer/search filters only apply to current 50-row page |
| FA-L504 | Med | error-handling | C | Privacy/Cookies/Accessibility render a blank legal policy silently on fetch failure |
| FA-L510 | Med | dependency | C | ActivityLog fetches entire profiles table (every user's email) into browser on every mount |
| FA-L516 | Med | other | C | ActivityLog CSV export can pull 250,000 rows client-side in serial 1k batches |
| FA-L522 | Med | error-handling | C | UnsubscribePage reports transient/network failures as 'Invalid or expired link' |
| FA-L528 | Med | boundary | C | Admin pages read/write Supabase tables directly from components, bypassing hooks/services |
| FA-L534 | Med | other | C | ActivityLog pagination uses unfiltered server count while filtering is client-side |
| FA-L540 | Med | error-handling | C | ActivityLog fetchProfiles no error handling — timeout → unhandled rejection, actors show raw UUIDs |
| FA-L546 | Med | other | C | CSV export ignores active layer/severity/search filters, exporting a different set than shown |
| FA-L552 | Med | other | P | Pagination bounds computed from a planner ESTIMATE, making real rows unreachable at scale |
| FA-L558 | Med | sec | P | Direct reads of profiles/audit_log lean entirely on RLS, only visible gate is client AdminRoute |
| FA-L564 | Low | sec | C | Teacher promote/revoke skip step-up 2FA required for admin promote/delete |
| FA-L570 | Low | sec | P | ActivityLog triage cell renders HTML string interpolating a DB value via innerHTML |
| FA-L576 | Low | ownership | C | BrandTokensPage hardcodes hex values that duplicate real theme tokens |
| FA-L582 | Low | other | C | Deliverability smoke test uses timestamped idempotency key — retries re-send every template |

### Auth, MFA & route-guard components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L592 | High | error-handling | C | AdminRoute fails OPEN on 2FA-grace RPC timeout — full admin surface renders with no gate |
| FA-L597 | High | error-handling | C | MfaEnforcementGuard fails OPEN when listFactors flakes — AAL1 user w/ verified TOTP never challenged |
| FA-L602 | High | sec | C | TotpMfaManagement re-auths with signInWithPassword in a component — frozen-auth violation, downgrades AAL2 |
| FA-L607 | High | sec | C | Single 2FA factor removal has NO step-up but 'Disable all' requires password — trash icon strips 2FA |
| FA-L612 | High | ownership | C | ProgressCacheIdentityGuard clears only ~13 hand-listed keys — other user-scoped cache survives identity switch |
| FA-L617 | Med | boundary | C | Grace-check workflow duplicated across AdminRoute and AdminTwoFactorGraceDialog, disagreeing semantics |
| FA-L622 | Med | dependency | C | UI components hard-code named DB RPCs (admin_2fa_grace_*), bypassing service layer |
| FA-L627 | Med | boundary | C | IdleTimeoutGuard bakes 60-min session policy into React, uses throwing signOut with no try/catch |
| FA-L632 | Med | error-handling | C | MfaChallengeDialog turns transient listFactors failure into non-dismissible 'contact support' lockout |
| FA-L637 | Med | error-handling | C | Disable-all 2FA is non-atomic unenroll loop — partial failure leaves inconsistent factor state |
| FA-L642 | Med | ownership | C | markCurrentSessionVerified failure silently desyncs client AAL2 from server proof — admin edge actions 403 |
| FA-L647 | Med | error-handling | C | AdminRoute treats transient listFactors failure as 'no TOTP', can lock a 2FA admin out to setup screen |
| FA-L652 | Med | error-handling | C | GoogleSignInButton arms OAuth-callback-pending guard before the call, never clears on failure |
| FA-L657 | Med | ownership | C | Server 2FA proof keyed to rotating access token, expires in 10 min while client AAL2 persists |
| FA-L663 | Low | ownership | C | auth_redirect written to BOTH localStorage and sessionStorage — stale cross-session redirect hijack |

### Profile, onboarding, projects, applications & certification components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L707 | High | boundary | C | Client-driven course completion re-fires Discord notifications on every revisit of a completed course |
| FA-L712 | Med | other | C | Admin 'core courses complete' counts any progress as a finished course — inflated eligibility |
| FA-L718 | Med | error-handling | C | GenericCoursePage progress load is a floating promise with no error handling |
| FA-L723 | Med | error-handling | C | ProfileSetupDialog autosave retries forever every 1.5s with no backoff, never reports failure |
| FA-L728 | Med | under-eng | C | ProfileSetupDialog leaks a visibilitychange listener on every keystroke |
| FA-L733 | Med | error-handling | C | ProfileSetupDialog 'Complete' non-atomic multi-step workflow misreports later-step failures as save failure |
| FA-L738 | Med | boundary | C | GeneralApplicationTab deletes a submitted application via direct supabase in component, no operator reporting |
| FA-L743 | Med | error-handling | C | delete-account uses raw functions.invoke instead of auditedInvoke and swallows the real error |
| FA-L748 | Med | error-handling | C | Certification sync uses raw functions.invoke and console.error instead of auditedInvoke/report |
| FA-L753 | Med | error-handling | C | WelcomeDialog uses localStorage unguarded — storage-disabled users trapped on welcome modal |
| FA-L758 | Med | other | C | SubmittedApplicationsTab keys general apps by user_id, silently drops all but one per user |
| FA-L763 | Med | error-handling | C | SubmittedApplicationsTab renders partial-load failures as legitimate empty data |
| FA-L768 | Med | under-eng | C | useProfileName and cert-card helpers duplicated across both certification tabs, each reading profiles directly |
| FA-L773 | Low | sec | P | MyProjectsTab defaults applicant_status to 'active_participant' — fail-open default gates Active-Teammate UI |
| FA-L778 | Low | dependency | C | ReadinessChecklist imports constants from a page module, computes apply-eligibility client-side |
| FA-L783 | Low | ownership | C | ClassImageUpload orphans storage objects on remove/replace |
| FA-L788 | Low | boundary | C | Systemic: onboarding/projects/applications/cert components reach past hooks/services into Supabase |

### Community, membership, notifications, PWA & dashboard components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L797 | High | error-handling | C | OfflineBanner locks entire app behind full-screen overlay driven solely by navigator.onLine |
| FA-L802 | High | error-handling | C | 'Reset Push' unregisters ALL service workers and always reports success even on failure |
| FA-L807 | Med | boundary | C | GA4 measurement ID and page_view dispatch duplicated in AnalyticsTracker, bypassing fail-closed consent |
| FA-L812 | Med | ownership | C | Professional yearly price hard-coded ('$192','$16×12'), shadowing config monthly price |
| FA-L817 | Med | boundary | C | Mark-all-read fans out into one write + one invalidation per unread announcement (N+1 storm) |
| FA-L822 | Med | dependency | C | AnnouncementBanner writes/reads localStorage during render (impure render body) |
| FA-L827 | Med | error-handling | C | PWA install prompt() rejections are unhandled promise rejections |
| FA-L832 | Med | under-eng | C | NetworkActivity silently substitutes a different metric when real completions count missing |
| FA-L837 | Med | under-eng | C | Duplicated iOS/standalone/device detection across the two PWA components |
| FA-L842 | Med | sec | P | NotificationBell navigates to DB-supplied link_url verbatim, breaking external links and skipping validation |
| FA-L847 | Med | boundary | C | NetworkActivity fetches Discord member count via supabase.functions.invoke inline in component |
| FA-L853 | Low | error-handling | C | AnnouncementBanner dismiss failure swallowed with no report |
| FA-L858 | Low | under-eng | C | DiscordInviteBanner gates on untyped (profile as any).has_discord_account |
| FA-L863 | Low | error-handling | C | DiscordRolePicker create-error branch reads an error field never populated on error path |
| FA-L868 | Low | over-eng | C | SectionEmptyState declares an icon prop it never renders |
| FA-L873 | Low | ownership | C | Founding/yearly membership price string derived independently in two components |
| FA-L878 | Low | other | C | DiscordRolePicker double-fetches roles on entering search mode (concurrent-request race) |

### App shell, layout, legal/consent, Fleety, editor & shared UI components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L888 | High | ownership | C | Four divergent copies of streamChat + duplicated chat persistence own the same tables |
| FA-L893 | High | error-handling | C | saveMessage swallows insert errors — chat messages silently lost |
| FA-L898 | High | error-handling | C | Consent audit write fails silently AND is de-duped before it succeeds |
| FA-L903 | High | ownership | P | Two consent owners + trackers loaded by both our code and CookieYes |
| FA-L908 | Med | error-handling | P | CookieYes banner_load with empty detail marks consent 'decided', logs a record user never gave |
| FA-L913 | Med | other | C | loadConversations pulls entire conversation history unbounded, on every open and send |
| FA-L918 | Med | other | C | AppLayout's save-data/2g Fleety gating is dead code — widget mounts unconditionally |
| FA-L923 | Med | error-handling | P | SSE parser stalls permanently on a single malformed frame, silently truncating the answer |
| FA-L928 | Low | ownership | P | chat_conversations.updated_at written by client instead of DB |

### Admin components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L937 | High | under-eng | C | Unbounded full-table fetch of every completed application on each project-analysis view |
| FA-L942 | High | dependency | C | Admin components write directly to the database, bypassing the services layer |
| FA-L947 | High | error-handling | C | ContentGapsTab silently swallows per-table query errors — placeholder gaps vanish |
| FA-L952 | High | under-eng | C | Costly platform-wide AI translation operations fire from single unconfirmed clicks |
| FA-L957 | Med | error-handling | C | TranslationsTab loader ignores all query errors, renders 'no locales/no failures' on failure |
| FA-L962 | Med | boundary | C | Recruitment-readiness scoring algorithm trapped inside a UI component |
| FA-L967 | Med | under-eng | C | 'Last 14 days' cost table uses an unordered LIMIT — shows arbitrary rows |
| FA-L972 | Med | error-handling | C | FleetyCostPanel silently discards two of three load errors |
| FA-L977 | Med | error-handling | C | FleetyHealthTab swallows every query error, then computes a truncated gap count |
| FA-L982 | Med | error-handling | C | FleetyPlaybooksManager ignores load errors — admins re-create existing content as duplicates |
| FA-L987 | Med | other | C | WorkshopDocsUploader maps upload results positionally — wrong docs marked uploaded/failed |
| FA-L992 | Med | error-handling | C | HIPAA-labelled PII-access audit-log failure is fully swallowed |
| FA-L997 | Med | under-eng | C | ContentGapsTab casts typed Supabase client to `any` to read/write 19 tables |
| FA-L1002 | Med | boundary | C | ApplicantStatusDropdown carries a multi-step status-change workflow inside a dropdown |
| FA-L1007 | Med | under-eng | P | WorkshopDocs ingest has no idempotency key — re-upload after ambiguous failure duplicates KB entries |
| FA-L1013 | Low | error-handling | C | authorPlaybookFromGap tells admin the question was copied even when clipboard write failed |
| FA-L1018 | Low | over-eng | C | Dead code: ApplicantsTable and enrichedRows memo built but never rendered |
| FA-L1023 | Low | dependency | C | MemberVideoActivityCard fetches in a raw useEffect instead of React Query layer |
| FA-L1028 | Low | under-eng | P | TranslationsTab coverage dedup over LIMIT 100 can silently drop locales at scale |

### System-health dashboard components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1037 | High | boundary | C | UI components write directly to compliance/ops tables, bypassing the service layer |
| FA-L1042 | High | sec | C | Live-editable, unvalidated regex silence rules can blind the entire error-monitoring pipeline |
| FA-L1047 | High | error-handling | C | Read-only safety tiles render query errors as a green/zero 'healthy' state |
| FA-L1052 | High | dependency | C | Hand-rolled useEffect fetching routes failures around the QueryCache error reporter |
| FA-L1057 | Med | under-eng | C | Outbox depth pulls up to 5000 rows to the browser and undercounts a deep queue |
| FA-L1062 | Med | under-eng | C | Unbounded email_send_log query counted client-side for the frequency-capped breakdown |
| FA-L1067 | Med | sec | C | DSAR queue selects * (PII payloads + requester emails) unbounded; 'appeal resets SLA' not implemented |
| FA-L1072 | Med | error-handling | C | DSAR compliance KPI tiles silently read 0 when the table filter is set to Closed |
| FA-L1077 | Med | under-eng | C | Web Vitals thresholds and formatters duplicated across two performance tabs |
| FA-L1082 | Med | ownership | C | AuditPressureTab re-implements SystemHealthService.getHealth/getTopErrors inline |
| FA-L1087 | Med | error-handling | C | ProjectBlastsHealthCard re-runs full RPC on every project_blasts change, never clears its error |
| FA-L1092 | Med | ownership | C | TriageTab hardcodes AI-triage daily cap (20) in three places; server owns it |
| FA-L1097 | Med | ownership | C | Incident status writes have no concurrency guard; 'mark notified' is a bare timestamp |
| FA-L1102 | Med | under-eng | C | Unbounded select('*') on incident_response, refetched every 60s, pulls full draft notices to browser |
| FA-L1107 | Med | sec | P | Pausing an email lane is a one-click unconfirmed action that can halt auth emails for all users |
| FA-L1112 | Low | under-eng | C | Type-safety bypass casts (supabase as any / as never) hide schema drift across the section |
| FA-L1117 | Low | boundary | C | TriageTab uses window.prompt for permanent-silence reason inside a Radix/shadcn app |
| FA-L1122 | Low | other | C | PerformanceTab default window contradicts its documented default |
| FA-L1127 | Low | error-handling | C | EdgeFunctionsTab reports deployed-but-erroring functions as green 'OK' |
| FA-L1132 | Low | dependency | C | AuditPressureTab imports useQuery from @tanstack/react-query instead of the app wrapper |

### Classes, courses, resources, projects & clients components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1141 | High | sec | C | ClientsTab actions column builds raw HTML with an unescaped client name — stored HTML/JS injection |
| FA-L1147 | Med | ownership | C | ClientsTab autosave is a second writer that bypasses clientSchema validation |
| FA-L1153 | Med | sec | P | Both certification tabs fetch all rows with no user scoping, trusting RLS entirely |
| FA-L1159 | Med | error-handling | C | Privileged/bulk edge calls bypass auditedInvoke; failures never reach operators |
| FA-L1165 | Med | ownership | P | UI hard-deletes clients and projects with no referential/orphan handling |
| FA-L1171 | Low | dependency | C | ProjectCertificationsTab casts (supabase as any), defeating generated-type checking |
| FA-L1177 | Low | error-handling | C | ClientsTab logo upload after create is non-atomic and swallowed to console only |

### Applications, forms, registration, agreements & feedback components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1187 | High | error-handling | C | Contributor can legally sign a community agreement whose body failed to load |
| FA-L1192 | High | boundary | C | Agreement signing reaches straight into Supabase from the component, bypassing hooks/services |
| FA-L1197 | High | ownership | C | Password policy is re-implemented in the UI as a third source of truth |
| FA-L1202 | Med | dependency | C | `as any` casts on agreement tables and RPC disable the schema-drift check |
| FA-L1207 | Med | boundary | C | AgreementResendButton invokes an edge function directly from the component |
| FA-L1212 | Med | ownership | C | Long-form char limit hardcoded in two components, divorced from the validator |
| FA-L1217 | Med | under-eng | C | Char-count textarea hand-rolled twice despite design-system CharCountTextarea |
| FA-L1222 | Med | error-handling | C | Autosave 'Reload form' destroys unsaved in-memory edits while telling user their typing is safe |
| FA-L1227 | Med | error-handling | C | Draft-discard failure is swallowed — dialog hangs with no error |
| FA-L1232 | Med | dependency | C | Form components reach into @/components/ui internals instead of @/design-system entrypoint |
| FA-L1237 | Med | ownership | P | Signature state trusts stale client query — no idempotency against double/concurrent signing |
| FA-L1242 | Med | ownership | P | Stale agreement status elsewhere if hand-listed invalidation keys don't match |
| FA-L1247 | Med | ownership | C | Signing a superseded agreement version treated as already-signed; new terms never re-prompted |
| FA-L1253 | Med | error-handling | C | Sign RPC records against server-current version, not the version shown (consent TOCTOU) |
| FA-L1259 | Med | error-handling | C | Autosave keeps only draft copy in volatile memory — no durable fallback when circuit opens |
| FA-L1265 | Low | error-handling | P | Unvalidated dates render as 'Invalid Date' or throw to users |
| FA-L1270 | Low | under-eng | C | Field-level errors not programmatically linked to their inputs |

### Quest, events, recruiting, profile, Fleety, auth & i18n components
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1279 | High | sec | C | QuestIntakeWizard writes the profiles table directly, bypassing ProfileService |
| FA-L1284 | High | error-handling | C | QuestIntakeWizard ignores the profiles update {error} — failed saves look successful |
| FA-L1289 | High | sec | C | FleetySources renders AI/RAG-supplied source URLs as raw hrefs with no protocol check (XSS) |
| FA-L1294 | Med | error-handling | C | Project blast mass-email has no idempotency key — retries double-send to every applicant |
| FA-L1299 | Med | boundary | C | Quest-completion business rule (isStepCompleted) lives in and is exported from a view file |
| FA-L1304 | Med | boundary | C | QuestDetailPage calls isStepCompleted without sysVerification — verified/application steps never count |
| FA-L1310 | Med | error-handling | C | CompletenessMeter swallows its fetch error and reaches into Supabase directly |
| FA-L1315 | Med | boundary | P | TurnstileChallenge render effect depends on onTokenChange identity — unmemoized prop remounts widget, wipes token |
| FA-L1320 | Med | under-eng | C | QuestExploreDialog shows a prerequisite lock but Add action never gated on it |
| FA-L1325 | Low | dependency | C | Multiple UI components query Supabase directly, bypassing hooks/service layer |
| FA-L1330 | Low | error-handling | C | FleetyMessageFeedback keeps optimistic selection after failed write, awaits lib calls w/o try/catch |
| FA-L1335 | Low | error-handling | C | AvatarCropperDialog swallows crop/encode/upload failures with no user-facing feedback |
| FA-L1340 | Low | under-eng | C | pathBySlug map rebuilt inline in several components despite useQuestPathMaps helper |
| FA-L1345 | Low | under-eng | P | ProjectBlastComposer displayed applicant count and edge fn's actual recipient set can disagree |

### shadcn UI primitives & component tests
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1355 | High | ownership | C | Four rival SaveStatus components ship at once; the "consolidation" molecule never replaced the legacy three |
| FA-L1360 | High | other | C | ui/SaveStatus.tsx and save-status.tsx collide on case-insensitive Windows/macOS filesystems |
| FA-L1365 | Med | other | C | translator-race test asserts the production bug is fixed but never simulates the translator (passes vacuously) |
| FA-L1370 | Med | ownership | C | "Saved N ago" relative-time formatting copy-pasted four times with divergent thresholds |

### Design system: atoms
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1379 | High | under-eng | C | Avatar compat shims render image AND fallback simultaneously, kill image-load-error fallback |
| FA-L1384 | High | under-eng | C | Slider/Toggle/RadioGroup/Checkbox/Switch never shim shadcn handler divergence — change handlers never fire |
| FA-L1389 | Med | under-eng | C | Many atom wrappers are plain function components that swallow refs |
| FA-L1394 | Med | dependency | C | InputOTP atom re-exports from the legacy @/components/ui layer it is meant to replace |
| FA-L1399 | Med | under-eng | C | Button asChild overwrites the child's event handlers instead of merging them |
| FA-L1404 | Med | under-eng | C | Button asChild also drops the child element's own ref |
| FA-L1409 | Low | other | C | Checkbox/Switch forwardRef typed as HTMLButtonElement but MUI attaches ref to inner <input> |
| FA-L1414 | Low | other | C | Text default tag map emits two semantic <h1>s on any page using both display and pageTitle |
| FA-L1419 | Low | error-handling | C | Progress forwards NaN straight through to MUI when value is NaN |
| FA-L1424 | Low | under-eng | C | Slider value-shape divergence (shadcn number[] vs MUI) is only a NOTE, not handled |
| FA-L1429 | Low | other | P | Avatar wrapper never forwards an accessible label, so every fallback avatar is unlabeled |

### Design system: molecules
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1438 | High | under-eng | C | Collapsible fully broken: content never opens and the trigger is a dead no-op |
| FA-L1443 | High | under-eng | C | Accordion silently loses single-open exclusivity and controlled value tracking |
| FA-L1448 | High | under-eng | C | Tabs renders a blank panel and no selected tab by default (uncontrolled) |
| FA-L1453 | High | under-eng | C | Compound triggers clobber the wrapped element's existing onClick/hover/focus handlers |
| FA-L1458 | High | error-handling | C | RHFSwitch silently drops all validation error messages |
| FA-L1463 | Med | ownership | C | MultiSelect silently discards selected values not present in current options |
| FA-L1468 | Med | error-handling | C | RHFCheckbox error is neither associated with the control nor announced |
| FA-L1473 | Med | under-eng | C | HoverCard content is non-interactive and unreachable, contradicting its own a11y docstring |
| FA-L1478 | Med | other | C | Select.onValueChange force-casts multi-select arrays and numeric values to string |
| FA-L1483 | Med | under-eng | C | Popover and DropdownMenu ignore controlled open / onOpenChange |
| FA-L1488 | Med | error-handling | C | SaveStatus announces save FAILURES on a polite, non-alert live region |
| FA-L1493 | Med | under-eng | C | Field's aria wiring silently no-ops for anything but a single element child |
| FA-L1498 | Med | other | P | Field passes aria-describedby/aria-invalid to MUI OutlinedInput root, missing the real <input> |
| FA-L1503 | Med | ownership | C | CharCountTextarea counter desyncs from a controlled value |
| FA-L1508 | Med | under-eng | C | DropdownMenu compat surface incomplete despite claiming to keep the shadcn compound API |
| FA-L1513 | Med | under-eng | C | Trigger shims silently no-op the entire open behavior for multi-child or non-element triggers |
| FA-L1519 | Med | under-eng | C | Tabs destroys in-progress panel state on every tab switch (inactive panels unmount) |
| FA-L1525 | Low | under-eng | C | Alert collapses 'default' into 'info' and renders AlertDescription outside MUI's message slot |
| FA-L1530 | Low | under-eng | C | Breadcrumb sub-part shims discard props and structure |
| FA-L1535 | Low | error-handling | C | SaveStatus becomes a dead-end 'Couldn't save' with no recovery when onRetry is omitted |
| FA-L1540 | Low | other | C | ConfirmDialog defaults to destructive styling, inverting the safe default |

### Design system: organisms, primitives & layout
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1550 | High | dependency | C | Design system depends UP into app-level @/components for six organisms, inverting layering |
| FA-L1555 | High | dependency | C | App-wide claim 'imports UI ONLY from @/design-system (enforced by ESLint)' is false — 650 legacy imports/166 files |
| FA-L1560 | Med | ownership | C | Two live import paths for same component (DS keep-lib and legacy ui/*), neither lint-banned |
| FA-L1565 | Med | boundary | C | Compound Trigger shims silently discard the child's existing onClick |
| FA-L1570 | Med | error-handling | C | Trigger silently no-ops on text or multi-child content — dead, unopenable trigger |
| FA-L1575 | Med | boundary | C | MUI-backed dialogs drop aria-labelledby/aria-describedby — unlabeled dialogs for screen readers |
| FA-L1580 | Med | error-handling | C | Confirm/Cancel close the dialog unconditionally — destructive action can't hold open on failure |
| FA-L1585 | Med | error-handling | C | DS ConfirmDialog's `loading` prop is dead and its confirm is async-unsafe |
| FA-L1590 | Low | error-handling | C | Silent controlled/uncontrolled switching via `controlled == null` |
| FA-L1595 | Low | boundary | C | Sheet uses 100vw width/maxWidth, forcing horizontal scroll when a scrollbar is present |
| FA-L1600 | Low | boundary | C | AlertDialog Action defaults to destructive variant regardless of context |
| FA-L1605 | Low | boundary | C | AlertDialog nests footer actions inside DialogContent, breaking MUI's action-area layout |
| FA-L1610 | Low | over-eng | C | Full MUI Table family exported as 'catalog parity' while DataTable is owner-locked — duplicate table mechanism |
| FA-L1615 | Low | over-eng | P | NoSsr primitive is a no-op in a client-only Vite SPA — misleading dead surface |
| FA-L1620 | Low | dependency | C | Layout Grid/Container/Stack are zero-value passthroughs hardcoding the app to MUI v7's Grid `size` API |

### Design system: theme, provider, tokens & tests
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1629 | High | ownership | C | Brand color truth is a hand-maintained mirror of index.css with no sync guard |
| FA-L1634 | High | ownership | P | Dark-mode link/primary color already drifts between DS tokens and index.css |
| FA-L1639 | Med | dependency | C | Shared design system imports app-layer ThemeProvider (dependency direction inverted) |
| FA-L1644 | Med | under-eng | C | docs-coverage.test.ts passes vacuously when paths/cwd are wrong (false-green guard) |
| FA-L1649 | Med | under-eng | P | Warning intention is white-on-amber, failing WCAG contrast, mirrored into DS tokens |
| FA-L1654 | Med | boundary | C | Theme default applies heavy stat-card glow skin to every MUI Card |
| FA-L1659 | Med | ownership | C | Brand blues hardcoded as literals in components.ts (third and fourth copies) |
| FA-L1664 | Med | under-eng | C | Dark-mode secondary text equals primary text (visual hierarchy collapses) |
| FA-L1669 | Med | over-eng | C | Entire MUI catalog re-exported via `export *` from the main barrel, used or not |
| FA-L1674 | Med | under-eng | C | Dark-mode link and info text color fails WCAG AA contrast |
| FA-L1680 | Low | under-eng | C | Three Button variants are byte-identical duplicated style blocks |
| FA-L1685 | Low | dependency | C | DS unit test imports across the src->docs boundary |
| FA-L1690 | Low | other | C | Typography px annotations do not match the actual clamp sizes |
| FA-L1695 | Low | error-handling | C | DesignSystemProvider hard-throws when no ThemeProvider ancestor (no fallback) |
| FA-L1700 | Low | boundary | C | MUI mode read from React state while Tailwind dark reads a class set in useEffect (theme flash) |
| FA-L1705 | Low | over-eng | C | Button augmentation adds TF variants without disabling MUI's native contained/text/outlined |
| FA-L1710 | Low | under-eng | P | Hero button dark-mode hover flips off-white to mid-blue with low-contrast dark label |

### Hooks
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1720 | High | sec | C | JWT access token written into the URL query string for the sendBeacon draft flush |
| FA-L1725 | High | error-handling | C | Realtime channel leak: teardown returned from async IIFE, never registered as effect cleanup |
| FA-L1730 | High | other | C | Idempotency hook mints a fresh request id per call, defeating server-side dedup |
| FA-L1735 | High | ownership | C | General application row has three uncoordinated last-write-wins writers + a duplicate-record create race |
| FA-L1740 | High | sec | C | Idle auto-signout defeated by any focused iframe or any playing media; catch fails toward signout |
| FA-L1745 | Med | error-handling | C | Autosave classifies transient 40001/40P01 as fatal schema_drift, permanently opening the circuit |
| FA-L1750 | Med | error-handling | C | Server-draft re-fires reportError every 30s after backoffs exhaust (no circuit, no reported-once guard) |
| FA-L1755 | Med | error-handling | C | sendBeacon return value ignored; draft marked saved even when beacon dropped |
| FA-L1760 | Med | other | C | Unread notification count derived from a list capped at 50; realtime ignores UPDATE/DELETE |
| FA-L1765 | Med | error-handling | C | Grid-state save and reset swallow every failure with no report and no UI feedback |
| FA-L1770 | Med | other | P | Membership realtime can drop the first tier change after mount (no refreshProfile, no toast) |
| FA-L1775 | Med | ownership | C | Client fires gumroad-reconcile on every fresh tab/reload (in-memory guard only) |
| FA-L1780 | Med | ownership | C | General application form is a second writer of profile fields owned by profile settings |
| FA-L1785 | Med | ownership | C | Milestone reference: inner 1h MemoryCache outlives React Query's 30m staleTime, can't be invalidated |
| FA-L1790 | Med | error-handling | C | UGC translation: unchecked job insert leaves a permanent spinner, floods job table with duplicates |
| FA-L1795 | Med | error-handling | C | Fleety chat persists with unchecked inserts and an uncaught save inside streamChat onDone callback |
| FA-L1800 | Med | sec | C | Admin grid state serializes free-text search (member PII) into URL and browser history |
| FA-L1805 | Med | other | C | Discord role-retry drain not multi-tab safe — no row claim or idempotency, risks double role grants |
| FA-L1810 | Med | sec | C | Explore sends client-mutable user_metadata to Discord via uncaught fire-and-forget call |
| FA-L1815 | Med | sec | P | Admin/teacher authorization served from a stale 2-minute client cache with no wired invalidation |
| FA-L1820 | Med | error-handling | C | System-health realtime subscribe has no status handler; admin dashboard silently freezes on drop |
| FA-L1825 | Med | error-handling | C | Discord role-retry: manage-discord-roles edge invoke NOT timeout-wrapped, contradicts hook's comment |
| FA-L1830 | Med | error-handling | P | UGC cache lookup uses .maybeSingle() over an .in() filter that can match multiple rows |
| FA-L1835 | Med | error-handling | C | General application profile sync swallows write failures — entered profile data silently diverges |
| FA-L1840 | Low | over-eng | C | Dead mergeHydration helper + unstable defaults deps churn the visibilitychange listener every render |
| FA-L1845 | Low | over-eng | C | Dashboard-preferences has identical-arm ternaries/IIFEs and re-runs the queryFn's normalization |
| FA-L1850 | Low | over-eng | C | Two parallel toast systems in use across hooks, with dead sonner imports |
| FA-L1855 | Low | dependency | C | Four hooks bypass the @/lib/react-query wrapper and import TanStack directly |
| FA-L1860 | Low | over-eng | C | useCommunityEventsWeek hand-rolls the edge-function call and silently downgrades to the anon key |

### Services
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1869 | High | sec | C | Rate limiter is client-trusted (peek/record split) and fails open on every error path |
| FA-L1874 | High | sec | C | MFA gate fails OPEN (skips step-up) when listFactors throws — mislabeled 'failing closed' |
| FA-L1879 | High | sec | P | MFA listFactors cache is a module global never invalidated on sign-out — stale cross-user factor decision |
| FA-L1885 | High | error-handling | C | Dead error reporting: inner best-effort helpers swallow, so caller .catch(reportError) is unreachable |
| FA-L1890 | High | ownership | C | QuestService writes journey_progress directly, bypassing JourneyService's task-ID whitelist |
| FA-L1895 | Med | error-handling | C | journey.upsertTask sets dedupe timestamp BEFORE the write — failed retry reports success, nothing written |
| FA-L1900 | Med | ownership | C | general-application is a second writer of profiles.professional_background (bypasses owner) |
| FA-L1905 | Med | ownership | C | about_yourself / professional_background / Airtable / feedback.email duplicated best-effort, no reconciliation |
| FA-L1910 | Med | boundary | P | explore.loadPopularAndRecent has no user filter — recents leak across users / popularity wrong at scale |
| FA-L1916 | Med | error-handling | C | quest.getSystemVerificationData swallows per-query errors, returns empty arrays — false-negative verification |
| FA-L1921 | Med | dependency | C | Services touch window/localStorage directly — violates scoped rule and Node-testability |
| FA-L1926 | Med | dependency | C | PushSubscriptionService is entirely browser/DOM orchestration — belongs in lib, not services |
| FA-L1931 | Med | error-handling | C | Duplicate-key errors suppressed by substring-matching error.message — brittle across PG/PostgREST wording |
| FA-L1936 | Med | error-handling | C | class-status emails fail silently to console and fan out sequentially per admin |
| FA-L1941 | Low | ownership | C | journey_progress.completed_at overwritten to now() on every re-completion upsert |
| FA-L1946 | Low | sec | C | reference search interpolates raw query into an ILIKE pattern (wildcard injection / full scan) |
| FA-L1951 | Low | under-eng | C | cohort.recordRegistrationClick computes userId then never passes it, silently no-ops when logged out |
| FA-L1956 | Low | error-handling | C | feedback insert retried without idempotency — network flap after committed insert duplicates the row |
| FA-L1961 | Low | dependency | C | Service imports a type from a component file, inverting the UI→service dependency arrow |

### Core lib: root utilities
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L1970 | High | ownership | C | Two divergent lazyWithRetry implementations with OPPOSITE reload behavior; the hard-reload one ships |
| FA-L1975 | High | sec | C | Login CAPTCHA answer stored and verified entirely client-side — trivially bypassed from the console |
| FA-L1980 | Med | error-handling | C | Dead ternary in lockout attempt counter — both branches byte-identical |
| FA-L1985 | Med | ownership | C | Four disagreeing hardcoded trusted-host lists; canonical prod domain omitted from redirect allowlist |
| FA-L1990 | Med | error-handling | C | hasPathTraversal throws URIError on malformed input — crashes file-upload validation on benign filename |
| FA-L1995 | Med | dependency | C | Global DOMPurify.addHook mutation at module import rewrites anchors for every sanitize call app-wide |
| FA-L2000 | Med | error-handling | C | withTrace corrupts the ambient trace id for every async operation it is meant to correlate |
| FA-L2005 | Med | boundary | C | query-config identity-cache invariant violated by its own key factory AND a third divergent purge list |
| FA-L2010 | Med | sec | C | CSV export is vulnerable to spreadsheet formula injection |
| FA-L2015 | Med | error-handling | C | email-domain-existence check fails OPEN on any error and does not cache the fail-open verdict |
| FA-L2020 | Med | boundary | C | Global window.fetch monkeypatch firewall is UX-only and silently fails open on any thrown error |
| FA-L2025 | Med | over-eng | C | 1,100-line security.ts grab-bag ships server/edge-only + fabricated logic into the browser bundle |
| FA-L2030 | Med | sec | C | Audit-log email hashing is reversible 64-bit unsalted truncation; raw email still logged for reset events |
| FA-L2035 | Med | ownership | P | audit_log written client-side via write_audit_log with client-supplied user id and email — forgeable/floodable |
| FA-L2041 | Med | sec | P | Raw error messages logged verbatim to audit_log, re-leaking the PII hashEmail pretends to protect |
| FA-L2047 | Low | under-eng | C | Three separate stripHtml implementations + duplicated nbsp normalization |
| FA-L2052 | Low | error-handling | C | React Query retry gate relies on English message-substring matching instead of the error code |
| FA-L2057 | Low | sec | C | Client lockout is decorative and its own error copy hands the attacker the bypass |
| FA-L2062 | Low | dependency | C | pdf-to-markdown mutates global pdfjs config at import and forces main-thread parsing |
| FA-L2067 | Low | sec | C | safeCompare is not constant-time despite its docstring |
| FA-L2072 | Low | error-handling | C | Cached-session coalescing defeated by auth churn, rejects all coalesced callers on one transient blip |
| FA-L2077 | Low | sec | C | isSafeExternalUrl SSRF allowlist has a dead regex — GCP *.internal hosts never blocked |

### Core lib: auth & consent modules
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2087 | High | error-handling | C | Consent audit write can be permanently dropped for the session |
| FA-L2093 | High | sec | C | signOutSafe silently downgrades global revoke to local-only |
| FA-L2099 | High | sec | P | Passive reconcile fabricates consent provenance (decidedAt) |
| FA-L2105 | Med | ownership | C | CookieYes→ConsentState mapping duplicated in two owners |
| FA-L2111 | Med | boundary | C | Consent recording and edge invoke live inside a UI component |
| FA-L2117 | Med | sec | C | reset-telemetry sends a recovery-token-hash prefix it claims never to send |
| FA-L2123 | Med | error-handling | P | reset-telemetry beacon and fetch paths carry different auth |
| FA-L2129 | Med | error-handling | P | Two-strike bad_jwt gate keyed to per-tab sessionStorage |
| FA-L2135 | Med | ownership | C | Production host list duplicated across client and edge, kept in sync by hand |
| FA-L2141 | Low | under-eng | C | Region/geo consent logic is dead — every visitor is 'unknown' |

### Core lib: Fleety AI modules
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2151 | High | error-handling | C | SSE retry logic stalls a live answer forever on any complete-but-malformed data line |
| FA-L2156 | Med | error-handling | C | streamChat accepts no AbortSignal/timeout — a hung turn can never be cancelled |
| FA-L2161 | Med | error-handling | C | onDone not guaranteed on mid-stream failure — no try/finally, no error callback |
| FA-L2166 | Med | under-eng | C | Unbounded textBuffer growth if server emits no newline (client-side memory DoS) |
| FA-L2171 | Med | over-eng | C | A 4th copy of the SSE contract ships while 3 inline copies stay live |
| FA-L2176 | Med | error-handling | C | Feedback writes swallow the DB error into a boolean — learning-loop signal lost silently |
| FA-L2181 | Med | boundary | C | submitReasons uses a non-atomic UPDATE racing the rating upsert, reports success on 0 rows |
| FA-L2186 | Med | sec | P | Feedback trusts client-supplied turn_id with no proof turn was served — learning-loop poisoning vector |
| FA-L2192 | Low | sec | C | Unvalidated free-text reasons written straight into the learning pipeline |
| FA-L2197 | Low | ownership | C | Feedback row owner (user_id) passed by caller instead of derived from session |
| FA-L2202 | Low | under-eng | C | Outbound messages silently truncated at 4000 chars while attachment bypasses the cap |
| FA-L2207 | Low | dependency | C | streamChat emits raw sources without the dedupeSources helper that exists for it |
| FA-L2212 | Low | boundary | C | Domain/lib module reads and writes localStorage directly |
| FA-L2217 | Low | error-handling | P | Trailing multibyte UTF-8 and final malformed lines silently dropped at stream end |

### Core lib: validation, errors, observability & telemetry
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2227 | High | sec | C | error-reporter writes raw error messages + stacks to audit_log with ZERO redaction (docstring lies) |
| FA-L2232 | Med | sec | C | logger.service redacts metadata and error objects but never the free-text `message` argument |
| FA-L2237 | Med | error-handling | C | redactValue recurses with no cycle/depth guard — circular metadata makes the logger throw and crash caller |
| FA-L2242 | Med | other | C | Trace correlation only survives sync portion of withTrace(); any await loses it, concurrent flows clobber global slot |
| FA-L2247 | Med | under-eng | P | transient-error classifies 40001/40P01 as pure infra_transient, hiding real concurrency bugs |
| FA-L2252 | Med | other | C | Over-broad transient patterns downgrade any error containing "timeout"/"aborted"/"Load failed" |
| FA-L2257 | Med | other | C | Rate-limit/dedup/escalate state entirely per-tab in-memory — no cross-client ceiling during global regression |
| FA-L2262 | Med | error-handling | C | writeAudit catch is a pure swallow with no console fallback — error pipeline can go dark (did for 7 days) |
| FA-L2267 | Low | error-handling | C | email-domain-validation fails open and does not cache the failure — validator outage re-invokes edge fn every submit |

### Core lib: data access, db, query & domain helpers
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2276 | High | boundary | C | DOM translator mutates React-owned text nodes → reconciler crash for every non-English user |
| FA-L2281 | High | sec | C | Discord finalize writes profiles.avatar_url with raw client, bypassing ProfileService (forbidden pattern) |
| FA-L2286 | High | error-handling | C | invokeEdge transparently retries non-idempotent edge calls with no idempotency key → duplicate side effects |
| FA-L2291 | High | sec | C | React Query persister falls back to a shared 'anonymous' cache scope → cross-user cache bleed |
| FA-L2296 | High | ownership | C | Two divergent isTransientError classifiers (plus a third classify) — 'retryable' has no single owner |
| FA-L2301 | High | error-handling | C | Timeout wrappers never abort the in-flight request AND two auto-retry the timeout → duplicate writes |
| FA-L2307 | Med | over-eng | C | Five+ overlapping retry/timeout wrappers; none provides timeout + retry + reporting together |
| FA-L2312 | Med | dependency | C | lib modules import upward from src/services and the frozen auth layer (inverted dependency) |
| FA-L2317 | Med | dependency | C | React hook (useQuestPathMaps) lives in src/lib and imports react |
| FA-L2322 | Med | other | C | format/date.ts formatTime computes time in browser zone but labels it with an arbitrary tz string |
| FA-L2327 | Med | under-eng | C | Raw supabase.functions.invoke calls bypass invokeEdge (and its ESLint rule) — no real timeout/trace/retry |
| FA-L2332 | Med | error-handling | C | DOM translator drops queued strings on edge error — silent permanent non-translation |
| FA-L2337 | Med | error-handling | C | finalizeDiscordLink fire-and-forget avatar save races cache invalidation, hides partial failure (orphan blob) |
| FA-L2342 | Med | error-handling | C | DOM translator silently drops pending strings beyond MAX_BATCH even on a SUCCESSFUL flush |
| FA-L2348 | Med | error-handling | C | classify() hard-codes translator's own reconciler-crash signature as unreportable — app blind to self-crashes |
| FA-L2354 | Low | error-handling | C | collapseNotificationsToDigest silently mis-groups when input not sorted created_at desc |
| FA-L2359 | Low | error-handling | C | bounded-save marks a save unresolved while write still in flight → retry duplicates |
| FA-L2364 | Low | other | C | Google Calendar all-day template uses UTC date parts → off-by-one day across timezones |

### Auth feature: engine, domain, ports, adapters & flows
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2373 | High | sec | C | MFA is a client-only dialog opened AFTER a live session is written; cancel never signs out |
| FA-L2379 | High | error-handling | C | Classifier maps HTTP 403 to invalid_credentials, firing full punitive lockout on any edge/WAF 403 |
| FA-L2385 | High | ownership | C | Three divergent impls of sign-up / reset-request / reset-complete; contract tests lock in the wrong owner |
| FA-L2391 | High | error-handling | C | Server-side punitive counters fire-and-forget with swallowed errors; only synchronous gate fails open |
| FA-L2397 | High | error-handling | C | Sanctions / export-control screening fails open on any error |
| FA-L2403 | High | sec | C | Sanctions screening entirely SKIPPED when stored consent country is unknown |
| FA-L2409 | High | sec | C | Open redirect: register engine navigates to raw unsanitized redirect param after sign-in |
| FA-L2415 | Med | sec | C | request-password-reset.flow returns error on transport failure, contradicting anti-enumeration; test locks it in |
| FA-L2421 | Med | error-handling | C | Registration partial-commit: policy ack inside failure-punishing try; throw punishes user for existing account |
| FA-L2427 | Med | boundary | C | Reset flow accepts an expired recovery link whenever ANY session is present |
| FA-L2433 | Med | sec | C | Device-lockout is client-side (localStorage), reset via spoofable ?from=password-reset param |
| FA-L2439 | Med | sec | C | Indeterminate signup probe re-submits plaintext password unthrottled against a possibly-unowned email (PROD) |
| FA-L2445 | Med | boundary | C | consume-recovery-link returns wrong success kind; contract test bakes it in |
| FA-L2451 | Med | dependency | C | sessionPort.rpc / invokeEdge erase all type safety via `as never` |
| FA-L2457 | Med | ownership | C | Two competing telemetry taxonomies write the same auth events to ops_events |
| FA-L2463 | Med | over-eng | C | supabase-session adapter is a false abstraction: 5 of 6 methods dead, 'only client importer' claim untrue |
| FA-L2469 | Med | dependency | C | OAuth-identity probe over a global window CustomEvent carrying member's email; listener re-registers |
| FA-L2475 | Med | error-handling | C | sign-out flow always reports success; server-revocation failure swallowed inside signOutSafe |
| FA-L2481 | Med | boundary | C | Flows default email redirect targets to window.location.origin instead of canonical origin |
| FA-L2487 | Med | sec | C | Admin-login success is audit-logged before the MFA second factor is completed |
| FA-L2493 | Low | dependency | C | 'engine' hooks are React UI controllers touching window/document/history/router/toast |
| FA-L2499 | Low | over-eng | C | Unused port/adapter scaffolding shipped as premature generalization (captcha port + rate-limit adapter dead) |
| FA-L2505 | Low | under-eng | C | Failure classification/action decision computed twice per failed login across two layers |
| FA-L2511 | Low | error-handling | P | Signup rate-limit/infra failure is punitive (fail-closed w/ device lockout), inconsistent with sign-in |

### Auth feature: services, testing & UI
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2521 | High | error-handling | C | HTTP 403 classified as invalid_credentials — the one punitive code driving all three lockout counters |
| FA-L2526 | High | under-eng | C | Guardian-consent email for minors (13–17) collected, validated, then silently dropped — never sent to backend |
| FA-L2531 | High | ownership | C | Three writers own session_started_at with divergent shapes; declared single owner bypassed |
| FA-L2536 | High | ownership | C | Two live services enforce contradictory idle/max-age session policies |
| FA-L2541 | High | sec | C | MFA verifyTotp returns signed_in without confirming AAL2 and with an empty userId |
| FA-L2546 | Med | error-handling | C | Signup timeout 'probe' signs user in and fires real credential attempts; original signUp never aborted |
| FA-L2551 | Med | error-handling | C | Server-side session-revocation check bypassed on any transient RPC error (fails open) |
| FA-L2556 | Med | error-handling | C | Token-issued-at falls back to account creation date, corrupting the revocation comparison |
| FA-L2561 | Med | error-handling | C | Idle-timeout security control silently disabled when storage writes are blocked |
| FA-L2566 | Med | under-eng | C | Stale sign-in test asserts a call path the implementation abandoned (direct SDK vs adapter) |
| FA-L2571 | Med | boundary | C | Duplicate MfaChallengeDialog components with incompatible prop contracts |
| FA-L2576 | Med | dependency | C | Sign-in service reaches into web globals (window/navigator) and the database directly |
| FA-L2581 | Med | under-eng | C | Telemetry record_event RPC cast to `never`, disabling all type-checking of incident-replay pipeline |
| FA-L2586 | Med | error-handling | C | Auth prober's sign-in stage uses a password its own run never sets (reset_complete skipped) |
| FA-L2591 | Med | error-handling | C | identity-hint fail-open defeats the google-only reset block whenever the identity service errors |
| FA-L2596 | Med | error-handling | C | session.service marker writes unguarded, so getSession throws for any user whose storage write is blocked |
| FA-L2602 | Med | sec | C | signOutAllDevices fails open — swallowed edge error leaves other devices authenticated while reporting done |
| FA-L2608 | Low | error-handling | C | request-password-reset throws success-worded copy as an Error on GoTrue failure |
| FA-L2613 | Low | error-handling | C | Rate-limit cleanup failure after a successful reset can strand the user in a lockout loop |
| FA-L2618 | Low | under-eng | C | Duplicated readFunctionError and triple-duplicated contract suites invite silent drift |
| FA-L2623 | Low | error-handling | C | Prober counts HTTP 200 as sign-out success regardless of body, unlike every other stage |
| FA-L2628 | Low | other | C | single-flight setSessionSafe returns first in-flight promise even when a second call passes different tokens |
| FA-L2633 | Low | other | P | Revocation RPC runs on every getSession call — per-navigation DB round-trip gating session validity |

### Class-curriculum, profile-setup & TAL-9000 features
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2643 | High | sec | C | profile-setup writes directly to the profiles table, bypassing ProfileService sanitization |
| FA-L2648 | High | sec | C | ProfileDraftFields strips only profile_completed, leaving every other column mass-assignable |
| FA-L2653 | Med | over-eng | C | Curriculum helper + release libraries are dead code duplicated inline in the components they serve |
| FA-L2658 | Med | error-handling | C | TAL-9000 rating write has no error handling and does not revert its optimistic state |
| FA-L2663 | Med | other | C | Chat messages keyed by array index cause reconciliation bugs on stream / conversation switch |
| FA-L2668 | Med | dependency | C | Curriculum service erases its own type safety with as unknown / as never casts around every table/RPC |
| FA-L2673 | Med | other | C | SectionEditorDialog leaks stale form data between successive New-section opens, carries dead no-op block |
| FA-L2678 | Med | ownership | P | Learner progress fetch ignores userId and returns all rows for the class, relying entirely on RLS |
| FA-L2684 | Med | error-handling | C | Autosave clears pending draft buffer before the write is confirmed, silently dropping edits on failure |
| FA-L2690 | Med | under-eng | C | complete() marks profile_completed=true with no field validation, bypassing ProfileInput schema |
| FA-L2696 | Low | error-handling | C | profile-setup completion side effects swallow failures with only a warn log |
| FA-L2701 | Low | sec | C | TAL-9000 renders RAG source links with unvalidated href |
| FA-L2706 | Low | other | C | TAL-9000 onBlur force-refocus is a keyboard/focus trap |
| FA-L2711 | Low | dependency | C | VideoEmbed imports Button from a different path than every sibling component |
| FA-L2716 | Low | error-handling | C | Curriculum reorder not optimistic despite the comment, rapid drags race on stale order |
| FA-L2721 | Low | error-handling | C | deleteAttachment swallows storage removal failure relying on an unproven orphan sweep |

### App contexts, config, static data & integrations
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2730 | High | dependency | C | i18n opens a second Supabase host path from a different env var, no auth header, silent English fallback |
| FA-L2735 | High | ownership | C | MemoryCache in data-layer fetchers never cleared on sign-out — cross-user data leak on in-place user switch |
| FA-L2740 | High | boundary | C | Client-side Discord 'new signup' business rule guarded only by per-tab sessionStorage + 2-min clock heuristic |
| FA-L2745 | High | error-handling | C | Profile fetch failure and 10s timeout both silently yield a null profile the app treats as ground truth |
| FA-L2750 | Med | error-handling | C | get-i18n-bundle raw-fetch bypasses auditedInvoke/circuit-breaker, swallows all errors |
| FA-L2756 | Med | sec | P | escapeValue:false globally with AI/DB-sourced bundles is a latent XSS if any t()-string reaches an HTML sink |
| FA-L2762 | Med | ownership | C | Founding-promo active decision duplicated on client using the client clock; server is real owner |
| FA-L2768 | Med | ownership | C | Founding promo price and end date hardcoded as prose in the FAQ — contradicts config when promo changes |
| FA-L2773 | Med | boundary | C | handbooks.ts and workshops.ts are near-identical DB fetchers in static-data layer, bypassing hooks/services |
| FA-L2778 | Med | error-handling | C | auditedInvoke discards real upstream status on retry exhaustion, re-throws shape-stripped error |
| FA-L2783 | Med | error-handling | P | auditedInvoke retries status-less failures (incl. CORS/deploy breakage) up to 3x, amplifying load |
| FA-L2789 | Med | dependency | C | AuthContext drives i18n global + localStorage and triggers an edge call from an unvalidated profile field |
| FA-L2794 | Med | boundary | C | useAuth falls back to a globalThis-stored context value in production, hiding out-of-provider misuse |
| FA-L2799 | Med | error-handling | C | OAuth profile sync writes to profiles then swallows every failure |
| FA-L2804 | Med | boundary | C | Dueling bootstrap writers: INITIAL_SESSION and getSession().then both set session/user, double-fetch profile |
| FA-L2809 | Med | ownership | P | fetchProfile has no in-flight dedup — concurrent bootstrap paths race, last-writer-wins installs stale profile |
| FA-L2815 | Med | error-handling | C | Supabase client has no env-var guard and touches localStorage at module load — misconfig bricks the app |
| FA-L2820 | Med | under-eng | C | community tier declares dual_recurrence CTA with no monthly SKU — advertised price with no purchase path |
| FA-L2826 | Low | boundary | P | TOKEN_REFRESHED updates session but not user or authEventSessionRef — transient divergence |
| FA-L2832 | Low | error-handling | C | Detached setTimeout(…,0) runs profile fetch/sync/toast outside React lifecycle after loading cleared |
| FA-L2837 | Low | error-handling | C | i18n init is fire-and-forget and the module runs document/global side effects on import |
| FA-L2842 | Low | error-handling | C | ensureLocale collapses all failures to `return false`, and its one caller ignores the result |
| FA-L2847 | Low | over-eng | C | PageHeaderContext value recreated every render and silently no-ops outside its provider |
| FA-L2852 | Low | under-eng | P | handbooks/workshops queries are unbounded (no .limit) and cached process-wide for 30 min |

### Edge: Auth & session
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2862 | High | sec | C | revoked_sessions enforced only by cooperative client code — stolen/live access token survives every revoke path |
| FA-L2868 | High | boundary | C | Captcha login gate fully bypassable via sibling auth-broker/sign-in/password route (captcha optional there) |
| FA-L2873 | High | sec | C | Turnstile verification bypassable because 'is production' decided from client-controlled Origin/Referer |
| FA-L2878 | High | sec | C | Recovery password-update accepts ANY valid session, not a recovery/AAL session — takeover |
| FA-L2883 | High | error-handling | C | record_event called with a p_source_table arg set absent from deployed signature — PGRST202 swallowed, zero telemetry |
| FA-L2888 | High | sec | C | Public unauthenticated telemetry sinks accept spoofable actor id + unbounded writes; record-auth-event no rate limit |
| FA-L2893 | High | sec | C | Irreversible self-serve account deletion requires only a bearer token — no re-auth or step-up |
| FA-L2898 | High | error-handling | C | revoke-user-sessions returns success:true even when the revocation insert or GoTrue signOut fails |
| FA-L2903 | High | under-eng | C | Synthetic auth-prober omits broker-required correlationId — every stage fails every run, permanent false paging |
| FA-L2908 | High | error-handling | C | finalize-password-reset swallows a failed revocation insert and still returns 200 ok |
| FA-L2914 | High | boundary | C | Two divergent password-reset-complete impls: one evicts other sessions, one does not |
| FA-L2919 | Med | under-eng | P | auth-prober sign-out stage authenticates with anon key and treats any 200 as success |
| FA-L2924 | Med | ownership | C | revoked_sessions has five uncoordinated writers with no single owner and divergent revoke_before rules |
| FA-L2929 | Med | boundary | C | Admin role check done two different ways across sibling admin functions |
| FA-L2934 | Med | sec | C | check-account-identity is a public account-existence oracle, contradicting broker's anti-enumeration |
| FA-L2939 | Med | ownership | C | check-account-identity resolves accounts by profiles.email — a mirror of auth.users email that can drift |
| FA-L2944 | Med | sec | P | Open redirect in non-recovery auth emails — verify link's redirect_to not origin-validated |
| FA-L2949 | Med | error-handling | C | auth-email-hook dedup is check-then-act (TOCTOU) with no unique constraint — concurrent retries double-send |
| FA-L2954 | Med | under-eng | C | In-memory per-isolate rate limiters ineffective at scale and leak memory unboundedly |
| FA-L2959 | Med | under-eng | C | admin-sign-out-all-users does hundreds of sequential GoTrue signOut round-trips + 100k-row insert in one request |
| FA-L2964 | Low | error-handling | C | auth-broker classifier maps unknown 400/422 GoTrue errors into invalid_credentials/weak_password |
| FA-L2969 | Low | error-handling | C | admin-purge-auth-user clears email-keyed protection rows and rate limits BEFORE confirming auth delete |
| FA-L2974 | Low | sec | C | Public telemetry endpoints leak raw database error messages to unauthenticated callers |
| FA-L2979 | Low | other | C | record-auth-recovery and record-auth-wedge annotated // @edge-auth but are fully public |

### Edge: Email pipeline (part 1/2 — dispatch & health)
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L2988 | High | ownership | C | bulk_paused auto-set true on rate breach but NEVER auto-cleared — one bounce spike silences bulk email forever |
| FA-L2993 | High | ownership | C | Two ungated dispatch pipelines drain two separate stores — v2 bitmask gate is dead code, double-processing |
| FA-L2998 | High | error-handling | C | Duplicate-send guard is a check-then-act race under a 30s pgmq visibility timeout batches routinely exceed |
| FA-L3003 | High | error-handling | C | replay-email-dlq infinitely re-processes a payload that fails to re-enqueue — no gen bump, no escalation |
| FA-L3008 | High | other | C | replay-dlq-emails marks recipients 'already_delivered' using ANY sent 'announcement' row — drops real emails |
| FA-L3013 | High | other | C | Auto-pause fires on tiny denominators — a few complaints during warm-up permanently pause bulk |
| FA-L3018 | High | ownership | P | v2 dispatcher never checks bulk_paused — auto-pause circuit breaker bypassed on v2 outbox path |
| FA-L3024 | Med | boundary | C | DLQ not terminal — replay-email-dlq auto-re-enqueues TTL/max-retry failures up to 3× more, defeating the cap |
| FA-L3029 | Med | sec | C | Four of ten cron functions bypass shared timing-safe service-role auth helper, using raw string comparison |
| FA-L3034 | Med | other | C | Audit-pressure extrapolation throttles audit logging during the incident that produces the writes |
| FA-L3039 | Med | error-handling | C | process-email-queue reads config with .single() no id filter, silently falls back to all-defaults |
| FA-L3044 | Med | error-handling | C | Unsubscribe-token insert failure fully swallowed — enqueues an email whose one-click unsubscribe is dead |
| FA-L3049 | Med | error-handling | C | refresh-email-health alerts 'auto-paused' while the pause never persists (state row missing/renumbered) |
| FA-L3054 | Med | under-eng | C | replay-dlq-emails N+1 announcement fetches + per-recipient inserts over up to 2000 rows — times out mid-replay |
| FA-L3059 | Med | error-handling | C | spf-sync self-heal (edge rebuild + MV refresh) non-transactional and swallowed — reproduces the failure it fixes |
| FA-L3064 | Med | error-handling | C | email-octopus sync poison row loops forever when settle fails — never increments attempts, never DLQs |
| FA-L3069 | Med | ownership | C | email-pipeline-health does read-modify-write on system_health_state.metadata — lost-update race |
| FA-L3074 | Med | error-handling | C | process-email-queue moveToDlq writes dlq log+audit BEFORE archiving — if move_to_dlq fails message re-DLQs every tick |
| FA-L3079 | Med | error-handling | C | audit.ts promises a security-event throttle exemption that does not exist — error/security rows dropped under load |
| FA-L3085 | Med | error-handling | C | replay-email-dlq escalation path loops admin notifications forever if archiveDelete fails after escalate |
| FA-L3091 | Med | error-handling | C | replay-email-dlq readArchive swallows all RPC errors and returns [] — broken archive read no-ops the DLQ drain |
| FA-L3097 | Low | other | P | Workspace-quota 429 cross-lane attribution can freeze the auth lane — delaying login/OTP/reset emails |
| FA-L3102 | Low | error-handling | C | email-dispatcher swallows gcExpired failure with .catch(()=>0) — GC breakage invisible |
| FA-L3107 | Low | under-eng | C | Announcement email rendering duplicated in replay-dlq-emails ('kept in sync') — guaranteed drift |
| FA-L3112 | Low | boundary | C | Two overlapping DLQ replayers with confusingly similar names read different DLQ stores |
| FA-L3117 | Low | over-eng | C | record_workspace_email_success double-wrapped in try/catch on top of safeRpc's own catch — patch-on-patch |

### Edge: Email pipeline (part 2/2 — send, suppression & webhooks)
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3126 | High | error-handling | C | Announcement one-click unsubscribe ships tokens never persisted → every unsubscribe 404s (RFC 8058 broken) |
| FA-L3132 | High | sec | C | handle-email-suppression maps reason:'unsubscribe' to GLOBAL suppressed_emails row — ADR-0018 lockout it forbids |
| FA-L3138 | High | error-handling | C | Unsubscribe burns single-use token BEFORE applying the preference — RPC failure leaves user un-unsubscribed, no retry |
| FA-L3143 | High | error-handling | C | eo-contact-status 500s on any Email Octopus (or auth) hiccup despite documenting 'never hard-fails' |
| FA-L3149 | High | boundary | C | Announcement blaster: per-recipient feature-flag N+1 + source-dedup bypass → times out mid-blast |
| FA-L3155 | High | under-eng | P | Announcement recipient query has no pagination — PostgREST 1000-row cap silently truncates ~1200-member blast |
| FA-L3161 | Med | ownership | C | No 'already sent' guard on announcement send — double-click/concurrent admin invoke re-blasts ~1200 members |
| FA-L3166 | Med | sec | C | Service-key / API-key checks use non-constant-time string comparison, bypassing repo's timing-safe helper |
| FA-L3172 | Med | under-eng | C | Signup safety-net sends at most ONE reminder per 6h globally — the '10-minute reminder' collapses under volume |
| FA-L3177 | Med | error-handling | C | Signup reminder bookkeeping writes unchecked — failed reminder-log insert re-reminds the same user indefinitely |
| FA-L3182 | Med | ownership | C | suppressed_emails has two independent writers with divergent reason vocabularies — dual ownership drift |
| FA-L3187 | Med | under-eng | C | send-transactional-email accepts unvalidated passthrough body, makes idempotency optional → retries double-send |
| FA-L3192 | Med | error-handling | C | Announcement email_send_log 'pending' insert unchecked after enqueue — delivered-but-unlogged blind spot |
| FA-L3198 | Low | ownership | C | Marketing attestation recorded before the send and never rolled back on failure |
| FA-L3203 | Low | error-handling | C | Announcement Discord cross-post fires even when zero emails were enqueued |
| FA-L3208 | Low | error-handling | C | validate-email-domain catch-all fail-open masks non-DNS bugs, not just DoH outages |
| FA-L3213 | Low | under-eng | C | Announcement body_html style-injected and re-stripped by two divergent hand-rolled parsers with manual sync |

### Edge: Discord integration
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3222 | High | boundary | C | Shared DISCORD_BOT_TOKEN hammered unthrottled by user-callable endpoints — one abuser 429s every Discord feature |
| FA-L3227 | High | ownership | C | False 'ONLY writer' invariant: three functions write discord_username; header comment lies about ownership |
| FA-L3232 | High | sec | C | One-account guard interpolates identity.username raw into a PostgREST .or() filter — false-positive lockout + injection |
| FA-L3237 | High | boundary | C | generate-discord-invite: any authenticated user can mint unlimited real server invites |
| FA-L3242 | High | sec | C | resolve-discord-id is a full guild-identity/PII scraper for any logged-in user |
| FA-L3247 | Med | error-handling | C | 403 (bot lacks permission) role-assign failures queued for automatic retry of a non-recoverable error |
| FA-L3252 | Med | error-handling | C | Raw err.message returned to clients in 4 functions — inconsistent with discord-notify's OWASP A09 handling |
| FA-L3257 | Med | error-handling | C | /fleety per-user rate limiter fails OPEN — cost/DoS exposure when RPC missing or DB stressed |
| FA-L3262 | Med | ownership | C | Non-atomic already-linked check leans on a unique index the code also detects by substring-matching error text |
| FA-L3267 | Med | sec | C | discord-project-update interpolates client_name/changes/milestones into a role-pinging post unsanitized |
| FA-L3272 | Med | error-handling | C | postFollowup drops rest of a multi-chunk answer on first failure — user gets silently truncated reply |
| FA-L3277 | Med | error-handling | P | /fleety per-user rate limit skipped entirely for any interaction lacking member.user.id (DM/user-install) |
| FA-L3282 | Low | sec | P | Discord-sourced discord_username written straight to profiles with no server-side sanitizing chokepoint |
| FA-L3287 | Low | under-eng | C | Six functions hand-roll the same anon+service client / getUser auth bootstrap instead of shared helper |
| FA-L3292 | Low | sec | C | manage-discord-roles LIST leaks full guild role structure to any authenticated user |
| FA-L3297 | Low | sec | C | manage-discord-roles assign has no allow-list of assignable roles — admin can grant any Discord role |
| FA-L3302 | Low | sec | C | Origin/Referer 'UI-only' gate is spoofable, gives no protection against the bot/replay threat it claims |
| FA-L3307 | Low | boundary | C | get-discord-member-count: unauthenticated service-role write path with thundering-herd refresh |
| FA-L3312 | Low | under-eng | C | backfill-discord-usernames runs unbounded profiles scan with one sequential Discord call per row (added-in-verification) |
| FA-L3317 | Low | other | C | Edge-function file annotations drift from actual auth posture (added-in-verification) |

### Edge: Payments (Gumroad) & Airtable sync
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3326 | High | under-eng | C | Weekly backfill backstop cannot downgrade an existing member — ignoreDuplicates discards refund/dispute/lapse state |
| FA-L3332 | Med | under-eng | C | Per-user login backfill has same blind spot — a lapsed/refunded member's existing sale row never downgraded |
| FA-L3338 | Med | error-handling | C | sync-airtable returns HTTP 200 on Airtable write failure and echoes raw Airtable error to caller |
| FA-L3343 | Med | under-eng | P | Airtable general_applications mirror has no reconciliation/drift detector — synced by opportunistic client calls |
| FA-L3349 | Med | ownership | P | Email is sole join key between Gumroad sales and profiles — an email change silently strips paid access |
| FA-L3355 | Med | under-eng | P | gumroad-backfill-all is sequential N+1 in a single 60s cron with no checkpoint — dies before reprojecting at scale |
| FA-L3361 | Low | sec | C | Webhook body-size cap measures string length, not bytes, despite comment claiming 'ACTUAL bytes read' |
| FA-L3366 | Low | error-handling | P | Lifecycle patch matched by subscription_id (sale_id absent) rewrites every sale row of the subscription |
| FA-L3371 | Low | sec | P | Gumroad ping secret passed in URL query string, exposing it to proxy/CDN/access logs |

### Edge: Freescout & support
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3381 | High | error-handling | C | Webhook records dedupe tripwire BEFORE enqueue — transient enqueue failure permanently loses the event |
| FA-L3386 | High | error-handling | C | Circuit breaker permanently disabled after its first trip — stops protecting Pikapod |
| FA-L3391 | High | error-handling | C | freescoutFetch blindly retries non-idempotent POST/PUT — duplicate customers, tickets, customer-facing replies |
| FA-L3396 | High | ownership | C | Event processor upsert writes customer_user_id=null on any unmatched-email event — wipes ownership and RLS visibility |
| FA-L3402 | Med | under-eng | C | create/reply accept an idempotencyKey that is never used — dedup is racy and reply has none |
| FA-L3407 | Med | error-handling | C | support_ticket_events insert has no ON CONFLICT — pgmq redelivery duplicates audit rows and re-fires notifications |
| FA-L3412 | Med | sec | C | Self-heal writes user-controlled names/email into profiles unsanitized and OVERWRITES existing rows |
| FA-L3417 | Med | ownership | C | No single owner for profiles.freescout_customer_id / freescout_user_id — 4+ concurrent writers |
| FA-L3422 | Med | dependency | C | In-isolate response cache + invalidateAll produce cross-isolate stale reads and lost updates |
| FA-L3427 | Med | sec | C | Public webhook body cap trusts Content-Length and buffers+HMACs unbounded body — CPU/memory DoS |
| FA-L3432 | Med | dependency | C | Service-role validator does NOT support the key rollover its callers' comments promise |
| FA-L3437 | Med | boundary | C | listAll applies assigned/unassigned filter client-side AFTER upstream pagination — unassigned triage hides tickets |
| FA-L3442 | Med | sec | P | findCustomerByEmail returns list[0] with no email verification — wrong-customer binding risk |
| FA-L3447 | Med | under-eng | C | register-support-command hand-rolls its own clients and admin check, diverging from every other function |
| FA-L3452 | Med | error-handling | C | GDPR anonymize failures never retried and falsely marked 'success' by retry drainer — PII persists indefinitely |
| FA-L3457 | Med | error-handling | C | provision-admin 'account ready' notification inserts non-existent columns inside an empty catch |
| FA-L3463 | Low | error-handling | C | userTagIndex leaks dead keys — LRU eviction and pre-emptive tagging never prune the tag index |
| FA-L3468 | Low | error-handling | C | Notification RPC failure logged-and-forgotten — member silently never notified, event still deleted |
| FA-L3473 | Low | error-handling | C | ownsConversation swallows upstream errors as false — Freescout outage surfaces to owner as 403 |
| FA-L3478 | Low | ownership | C | provision paths INSERT a fresh log row every attempt instead of updating — unbounded log |
| FA-L3483 | Low | error-handling | C | support-provisioning-retry has no row claim/visibility-timeout — overlapping crons double-provision |
| FA-L3488 | Low | error-handling | C | safeEventId synthesizes coarse ids that collide — distinct events dropped as duplicates |
| FA-L3493 | Low | error-handling | C | provision-admin logs status:'success' though profiles update result never checked |
| FA-L3498 | Low | error-handling | P | Event processor + lookups use .maybeSingle() on profiles.email — shared/duplicate email throws and DLQs event |

### Edge: Fleety AI (part 1/2 — chat, embeddings & review)
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3508 | High | ownership | C | Response cache leaks one member's personalized answer to every other member |
| FA-L3513 | High | ownership | C | Material-review chat answers cached and served cross-member (isCacheable never excludes hasMaterial) |
| FA-L3519 | High | dependency | C | fill-content-gaps re-embed call to fleety-embed uses a body shape fleety-embed rejects — embeddings never refresh |
| FA-L3524 | High | sec | C | fleety-review is an uncapped DeepSeek-V4-Pro + outbound-fetch endpoint (no rate limit, no quota, no cost accounting) |
| FA-L3529 | Med | boundary | C | Output sanitization runs per SSE delta — script/PII/canary split across chunks evades it |
| FA-L3534 | Med | ownership | C | Learning-digest auto-promotes canned answers by timestamp-matching a chat_messages row this pipeline never writes |
| FA-L3539 | Med | dependency | C | Member query text shipped to Lovable/Gemini gateway with no US-residency pin or DLP scrub |
| FA-L3544 | Med | error-handling | C | fleety_topic_insights snapshot rebuild is non-transactional delete-then-insert with a concurrency race |
| FA-L3549 | Med | ownership | C | Playbook/example embeddings never re-embedded on model change, carry no model tag — silent vector-space drift |
| FA-L3554 | Med | under-eng | C | fleety-review reloads ALL workshop_step rows with no pagination — reintroduces the 1000-row truncation |
| FA-L3559 | Low | error-handling | C | Body-size limit enforced only from client Content-Length header and trivially bypassed |
| FA-L3564 | Low | sec | C | Weekly-digest compares service-role key with non-constant-time !==, unlike every sibling cron |
| FA-L3569 | Low | under-eng | C | Weekly and learning digests silently truncate their aggregates at 1000/2000 rows |
| FA-L3574 | Low | sec | C | ilike dedup checks pass user-controlled text as the LIKE pattern (wildcard injection) |
| FA-L3579 | Low | under-eng | C | fill-content-gaps only queries null/empty descriptions but claims to fill 'under 20 chars' |
| FA-L3584 | Low | sec | C | register-fleety-command leaks raw Discord API bodies and internal config detail to the client |
| FA-L3589 | Low | sec | P | fleety-embed Mode A (query embedding) callable by any authenticated member with no quota/rate limit/cost accounting |

### Edge: Fleety AI (part 2/2 — knowledge ingestion & content)
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3599 | High | ownership | C | CSV & workshop ingest never invalidate embeddings → permanent stale-vector drift in Fleety RAG |
| FA-L3604 | High | error-handling | C | seed-content non-atomically blanks the legal/consent surface on partial failure |
| FA-L3609 | High | ownership | C | seed-content silently rolls published policies back to hardcoded 1.0.0 |
| FA-L3614 | High | boundary | C | prewarm-ugc-worker has no atomic dequeue — overlapping crons double-spend paid AI |
| FA-L3619 | High | error-handling | C | prewarm-ugc-worker: failed jobs never retried and orphaned 'processing' jobs never reaped |
| FA-L3624 | High | sec | C | firecrawl-search lets any of 767 members trigger unbounded paid external searches |
| FA-L3629 | Med | error-handling | C | prewarm-ugc-worker cost cap silently disabled when the count RPC errors |
| FA-L3634 | Med | ownership | C | scrape-figma-workshops mislabels scraped descriptions as source='csv', corrupting provenance |
| FA-L3639 | Med | under-eng | C | scrape-figma-workshops overwrites the wrong workshop on a 0.45 fuzzy match |
| FA-L3644 | Med | sec | C | Five ingest/content functions bypass shared constant-time service-role check; seed-content uses .includes() |
| FA-L3649 | Med | ownership | C | knowledge_base has four uncoordinated writers with divergent row contracts |
| FA-L3654 | Med | under-eng | C | ingest-csv-knowledge slug collisions silently overwrite entries and inflate the success count |
| FA-L3659 | Med | boundary | C | ingest-reference-csv emits framework edges via an N+1 RPC loop that can exceed the edge time budget |
| FA-L3664 | Med | error-handling | C | ingest-reference-csv swallows MV-refresh, KB-sync and provenance-log failures with no logging |
| FA-L3669 | Med | under-eng | C | scrape-figma-workshops defaults autoDiscover ON and dryRun OFF — empty admin POST overwrites up to 200 workshops |
| FA-L3675 | Med | other | P | ingest-reference-csv sends full slug lists through unbatched PostgREST .in() filters — large imports truncate/fail |
| FA-L3681 | Med | other | P | prewarm-ugc-worker writes QA-failed machine translations into the same serving table as passed ones |
| FA-L3687 | Med | under-eng | C | ingest-csv-knowledge & ingest-workshop-docs store unchunked rows up to 80k chars while fleety-embed vectorises ~8k |
| FA-L3693 | Low | error-handling | C | guide-ingest delete-then-upsert of chunks is non-atomic; a mid-page failure loses chunk rows |
| FA-L3698 | Low | boundary | C | guide-ingest chunk delete uses raw URL in a LIKE pattern — underscore/percent act as wildcards |
| FA-L3703 | Low | error-handling | C | prewarm-ugc-worker and scrape-figma-workshops make external AI/scrape calls with no timeout |
| FA-L3708 | Low | error-handling | C | Sensitive writers run without the audit wrapper — no trail for legal, cost, or reference-data changes |
| FA-L3713 | Low | sec | C | write-exploration-cache comment falsely advertises a constant-time secret compare on a public endpoint |
| FA-L3718 | Low | error-handling | C | scrape-figma re-embed is best-effort-swallowed — a description update can land with a permanently stale vector |

### Edge: Roles, admin & certifications
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3728 | High | error-handling | C | Confirmation token consumed BEFORE the role is granted → transient DB error permanently bricks the promotion |
| FA-L3733 | High | sec | C | mark-interview-scheduled emails applicant PII to whoever it guesses is the admin by scanning audit_log |
| FA-L3738 | Med | dependency | C | Confirmation-token expiry depends entirely on an unseen DB default; nothing sets expires_at, null=never-expires |
| FA-L3743 | Med | sec | C | 2FA step-up enforced on promote-to-admin but NOT on promote-to-teacher or revoke-teacher-role |
| FA-L3748 | Med | error-handling | C | revoke-teacher-role writes no audit log for a security-sensitive role removal |
| FA-L3753 | Med | error-handling | C | revoke-teacher-role returns raw internal/DB error text to the client |
| FA-L3758 | Med | error-handling | C | grant-observer-role: completions finished by retry queue never send the Tier-0 'you're an Observer' email |
| FA-L3763 | Med | ownership | C | grant-observer-role mirrors discord_user_id into observer_role_optins → stale copy grants roles to wrong account |
| FA-L3768 | Med | error-handling | C | grant-observer-role audit() swallows all errors, and the abuse rate limiter counts those best-effort rows |
| FA-L3773 | Med | other | C | fetch-class/project-certifications: unbounded N+1 sequential Airtable calls with no cross-user caching |
| FA-L3778 | Med | sec | C | fetch-*-certifications write user email PII into audit_log.changed_fields and console on every sync |
| FA-L3783 | Med | boundary | C | User-facing privilege-granting endpoints mislabeled @edge-cron, hiding them from public-surface review |
| FA-L3788 | Med | boundary | C | mark-interview-scheduled no-coordinator fallback emails + notifies EVERY admin with applicant PII |
| FA-L3794 | Med | error-handling | C | grant-observer-role Tier-0 confirmation best-effort; alreadyGranted short-circuit never retries a dropped one |
| FA-L3800 | Low | sec | C | grant-observer-role rate limit is a non-atomic TOCTOU check |
| FA-L3805 | Low | under-eng | C | promote-to-admin and promote-to-teacher duplicate ~90% of the flow and embed full HTML email templates |
| FA-L3810 | Low | error-handling | C | mark-interview-scheduled updates status without a compare-and-set guard → TOCTOU duplicate notifications |
| FA-L3815 | Low | error-handling | C | fetch-*-certifications return HTTP 200 with success:false on Airtable failure, contradicting the 500 catch |
| FA-L3820 | Low | error-handling | C | Certification name resolution silently stores raw Airtable record IDs when a lookup fails |
| FA-L3825 | Low | ownership | C | promote-* insert a second email_send_log row with the same message_id on enqueue failure |
| FA-L3830 | Low | under-eng | C | mark-interview-scheduled reimplements escapeHtml locally instead of the shared helper |
| FA-L3835 | Low | error-handling | C | grant-observer-role drops the grant with no retry when Discord returns 404 |
| FA-L3841 | Low | sec | P | fetch-*-certifications persist the entire raw Airtable record into raw_data with no field minimization |

### Edge: Notifications & push
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3851 | High | error-handling | C | Interview/status emails embed Date.now() in idempotency/messageId key, defeating source-level dedup, double-emailing |
| FA-L3856 | High | error-handling | C | notify-class-published claims per-follower idempotency that does not exist — re-invoke re-spams whole follower set |
| FA-L3861 | High | error-handling | C | send-project-blast has no cross-retry idempotency, strands blasts in 'sending' on timeout, re-emails up to 5,000 |
| FA-L3866 | High | error-handling | C | process-notification-fanout silently abandons a job on chunk error — no retry, no audit, no alert, partial fan-out |
| FA-L3871 | High | sec | C | Internal secret compared with plain === (timing side-channel), defaults to raw service-role key sprayed in a header |
| FA-L3876 | High | error-handling | C | notify-critical-fix marks a critical fingerprint 'pushed' even when zero recipients received it — suppresses alert |
| FA-L3882 | Med | boundary | P | process-notification-fanout has no job lock; overlapping cron runs double-process and duplicate notifications |
| FA-L3887 | Med | error-handling | C | Discord welcome-post idempotency is a read-then-write TOCTOU across a Discord round-trip — double-posts |
| FA-L3892 | Med | error-handling | C | send-community-agreement-trigger and send-project-blast bypass withAuditWrapper; unguarded top-level RPCs crash |
| FA-L3897 | Med | ownership | C | Three functions write the notifications table with a raw INSERT, bypassing the self-healing outbox/DLQ guarantee |
| FA-L3902 | Med | error-handling | C | send-push-notification blanks the expired endpoint on 410, caller ignores body — dead subscriptions never pruned |
| FA-L3907 | Med | error-handling | C | notify-critical-fix throws on null error_message (500s whole critical batch), swallows every individual push failure |
| FA-L3912 | Med | error-handling | C | notify-critical-fix 'push once' depends on an unchecked log insert written AFTER sending; non-atomic |
| FA-L3917 | Med | error-handling | C | active_participant re-runs re-fire community-agreement flow, duplicating in-app training-offer notification |
| FA-L3922 | Med | ownership | P | project_applications carries two parallel status columns (applicant_status vs status) with no reconciliation |
| FA-L3927 | Med | error-handling | C | Silent no-op when an active teammate has no Discord id — role never assigned, no audit, admin sees success:true |
| FA-L3932 | Med | under-eng | C | Long serial fan-outs in one invocation risk edge timeout, leaving the tail of recipients silently un-notified |
| FA-L3937 | Med | sec | C | Timing-unsafe service-role key compare in four functions while hardened timingSafeEqualStr exists |
| FA-L3943 | Med | boundary | C | notify-applicant-status trusts applicationId/applicantUserId/projectId as independent UUIDs, never confirms UPDATE hit a row |
| FA-L3949 | Low | under-eng | C | escapeHtml reimplemented twice alongside the shared helper with divergent null handling |
| FA-L3954 | Low | dependency | C | Inconsistent supabase-js import source and pin across the section |
| FA-L3959 | Low | error-handling | C | wasDelivered advances the one-shot/debounce gate on in-app success even when primary email channel failed |
| FA-L3964 | Low | under-eng | C | notify-class-published accepts a malformed UUID via a weak regex |
| FA-L3969 | Low | error-handling | C | safe_create_notification / notification failures logged but not surfaced; class-publish returns 200 ok:true while dropping |

### Edge: Consent, privacy & DSAR
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L3978 | High | error-handling | C | revoke-recording-consent returns ok:true even when the write fails — recording consent never actually revoked |
| FA-L3983 | High | sec | C | screen-sanctions screens a client-supplied country_code with no server-side geo — export-control gate one-field bypass |
| FA-L3988 | High | under-eng | C | Embargoed-region entries (Crimea/Donetsk/Luhansk) can never match a real country code — silently unscreened |
| FA-L3993 | High | sec | C | record-consent is a public unauthenticated service-role table write with client-controlled anon_id, no rate limit |
| FA-L3998 | High | error-handling | C | submit-dispute rate limiter fails open — silently disabling the impersonation protection its comment claims |
| FA-L4003 | High | sec | P | screen-sanctions decision is advisory-only — a 'deny' recorded but nothing server-side enforces at account creation |
| FA-L4009 | Med | other | C | Function auth annotations contradict actual behavior across the whole section — verify_jwt/deploy-gate risk |
| FA-L4014 | Med | sec | C | dsar-submit, record-policy-acknowledgment, record-consent leak raw Postgres error text to the client |
| FA-L4019 | Med | error-handling | P | Docstrings promise info@ email notifications never sent — statutory SLAs depend on someone watching a dashboard |
| FA-L4024 | Med | ownership | C | Consent state fragmented across three tables with no single owner — withdrawal via one path never propagates |
| FA-L4029 | Med | boundary | C | record-policy-acknowledgment silently drops policy keys outside a hardcoded allow-list — incomplete legal records |
| FA-L4034 | Med | under-eng | C | Unbounded/unvalidated JSON persisted on privacy endpoints — dsar payload and record-consent accept arbitrary blobs |
| FA-L4039 | Med | ownership | C | revoke-recording-consent has no idempotency — repeated/concurrent revokes insert duplicate revocation rows |
| FA-L4044 | Med | error-handling | C | audit.ts silently caps and drops audit events per isolate under load — compliance rows lost during incidents |
| FA-L4049 | Med | sec | C | record-policy-acknowledgment has no rate limit, accepts client-supplied anon_id — acceptance trail forgeable/floodable |
| FA-L4055 | Low | boundary | C | dsar-submit has no rate limit or idempotency — duplicate DSAR rows each start a 30-day statutory clock |
| FA-L4060 | Low | under-eng | C | Sanctions deny-list and list version hardcoded compile-time constants — updates need a code redeploy |
| FA-L4065 | Low | sec | C | Public/service-role compliance endpoints use wildcard CORS with no origin restriction |
| FA-L4070 | Low | under-eng | P | record-consent runs an unindexed latest-row lookup on cookie_consents for every insert — cost amplifier on floodable table |

### Edge: i18n, content, public & handoff endpoints
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L4080 | High | sec | C | AI-translation spend cap bypassable (anon-JWT/XFF rotation) + fail-open limiter → unbounded LOVABLE_API_KEY drain |
| FA-L4085 | High | sec | C | get-community-events leaks organizer email addresses to the anonymous public (no DLP pass) |
| FA-L4090 | High | error-handling | C | Transient Figma failure permanently blanks a submitted deliverable (empty sentinel never re-fetched) |
| FA-L4095 | High | boundary | C | handoff-submit 50MB path is OOM-able by a chunked request with no Content-Length |
| FA-L4100 | Med | under-eng | C | translate-bundle never loads the real English source — permanently caches a 1-key bundle as the whole namespace |
| FA-L4105 | Med | ownership | C | Machine translations bypass the i18n QA/approval gate and split into two inconsistent serving paths |
| FA-L4110 | Med | error-handling | C | handoff-submit uploads the blob BEFORE the DB insert — insert failure orphans the file with no cleanup |
| FA-L4115 | Med | under-eng | C | Uploaded files counted 'complete' but their bytes never extracted — pipeline feeds only the filename string |
| FA-L4120 | Med | sec | C | Public feeds run on the service role (RLS bypassed), guarded only by a hand-maintained column list + regex DLP |
| FA-L4125 | Med | sec | C | geo-hint trusts spoofable client headers for country |
| FA-L4130 | Med | ownership | C | refresh-community-events uses .update() on the singleton, not upsert — a missing row makes refresh a silent no-op |
| FA-L4135 | Med | sec | C | get-community-events rate limit is isolate-local, keyed on spoofable leftmost XFF, and leaks memory |
| FA-L4140 | Med | sec | P | translate-strings shared-batch prompt injection can poison the shared translation cache served to all users |
| FA-L4146 | Med | sec | C | translate-bundle accepts an arbitrary unvalidated namespace and writes it to i18n_translations under service role |
| FA-L4152 | Low | over-eng | C | write-version.ts is dead production code duplicating the live inline arc-writer |
| FA-L4157 | Low | other | C | public-classes CORS allow-list is inert — any origin falls back to '*' |
| FA-L4162 | Low | dependency | C | Four different supabase-js import specifiers/versions across these functions |
| FA-L4167 | Low | error-handling | C | public-project-detail uses .single() for the coordinator profile — a missing/duplicate row 500s the endpoint |
| FA-L4173 | Low | under-eng | P | translate-bundle has no single-flight — concurrent cache misses each fan out a full-namespace LLM translation |

### Edge: Security, rate-limit & ops
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L4183 | High | sec | C | Turnstile human-verification fully bypassable by omitting the Origin header |
| FA-L4188 | High | error-handling | C | edge-deploy-smoke is structurally blind to un-deployed verify_jwt=false critical functions |
| FA-L4193 | High | sec | C | User JWT accepted (and logged) in the URL query string in save-form-draft |
| FA-L4198 | High | sec | C | Unauthenticated rate-limit endpoint enables targeted account-lockout DoS by victim email |
| FA-L4203 | Med | error-handling | C | Rate limiter fails OPEN on RPC error — brute-force protection silently disabled |
| FA-L4208 | Med | error-handling | C | triage-error burns daily AI budget on transient failures with no refund |
| FA-L4213 | Med | error-handling | C | Orphan reaper reports ok:true while storage deletions are failing |
| FA-L4218 | Med | ownership | C | Rate-limit identity hash is peppered with the service-role key |
| FA-L4223 | Med | under-eng | C | save-form-draft and client-rate-limit-log buffer request bodies unbounded |
| FA-L4228 | Med | error-handling | P | edge-deploy-smoke classifies any non-404 as alive — a crash-looping deployed function never pages |
| FA-L4233 | Low | sec | C | Internal DB/exception messages leaked to clients in save-form-draft |
| FA-L4238 | Low | dependency | P | triage-error builds a service-role client carrying the user's JWT — latent privilege footgun |
| FA-L4243 | Low | sec | C | Turnstile token is not hostname- or action-bound server-side |
| FA-L4248 | Low | error-handling | C | record-web-vital swallows insert errors entirely (silent RUM data loss) |
| FA-L4253 | Low | boundary | C | Manifest kind labels misclassify public/unauth endpoints as cron/auth |
| FA-L4258 | Low | error-handling | P | Per-IP edge rate limit collapses to one shared bucket when IP headers are absent |

### Database schema, RLS & migrations
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L4267 | High | sec | C | decrypt_pii() is an authenticated-reachable PII decryption oracle with no internal authz guard |
| FA-L4272 | High | dependency | C | No migration tracking + CREATE OR REPLACE re-granting PUBLIC = silent prod drift and re-exposed internal functions |
| FA-L4277 | High | boundary | C | profiles RLS grants column-wide UPDATE to authenticated, bypassing ProfileService allow-list/sanitization |
| FA-L4282 | High | sec | C | run_auto_remediations() is SECURITY DEFINER, granted to authenticated, with NO internal admin gate |
| FA-L4288 | Med | sec | C | chunk_stale_log allows unbounded unauthenticated INSERT of attacker-controlled text |
| FA-L4293 | Med | sec | C | admin_list_users returns the full profiles row minus a single deny-listed column (blocklist, not allowlist) |
| FA-L4298 | Med | ownership | C | profiles.email is an un-reconciled mirror of auth.users.email; client changes silently reverted, not rejected |
| FA-L4303 | Med | sec | C | email queue pgmq wrapper functions are SECURITY DEFINER with no SET search_path |
| FA-L4308 | Med | error-handling | C | audit_log.changed_fields stores raw PII values despite an explicit 'no values stored' schema contract |
| FA-L4313 | Med | error-handling | P | tg_hash_chain reads the previous audit hash with no lock — concurrent inserts fork the tamper-evidence chain |
| FA-L4319 | Med | error-handling | C | encrypt_pii fails OPEN — silently stores cleartext PII when the vault key is missing |
| FA-L4325 | Med | other | P | membership_tier enum swap does a full ACCESS EXCLUSIVE rewrite of profiles, hand-applied on prod no tx/maintenance |
| FA-L4331 | Low | dependency | C | Grant posture is emergent across dozens of ad-hoc REVOKE/GRANT migrations with no owning source of truth |

### Edge shared utilities & Supabase config/tests
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L4340 | High | error-handling | C | Audit pipeline throttles security events during an attack (comment says it doesn't) |
| FA-L4345 | High | sec | C | WAF body-size cap trusts Content-Length — the exact DoS bounded-body.ts exists to stop |
| FA-L4350 | High | sec | C | Client IP resolution falls back to attacker-controlled headers when cf-connecting-ip is absent |
| FA-L4355 | High | error-handling | C | Edge rate limiter fails OPEN on any error — evaporates during the load it exists to cap |
| FA-L4360 | Med | error-handling | C | Freescout circuit breaker gets stuck permanently half-open after a failed probe |
| FA-L4365 | Med | ownership | C | Three-to-four divergent CORS header definitions across the shared library |
| FA-L4370 | Med | ownership | C | functions.manifest.json 'kind' misclassifies public and client-invoked functions as cron/auth |
| FA-L4375 | Med | ownership | C | Allowed-origin / production-host facts copied into 3+ hand-synced lists |
| FA-L4380 | Med | dependency | C | supabase-js pinned at three different versions across the shared library |
| FA-L4385 | Med | error-handling | C | Idempotency replay hardcodes HTTP 200 and discards all original headers |
| FA-L4390 | Med | sec | C | Unverified JWT decoding used for identity in idempotency and admin step-up |
| FA-L4395 | Med | sec | C | idempotency anon scope collapses all unauthenticated callers into one shared key-space |
| FA-L4401 | Med | under-eng | C | freescoutCache userTagIndex leaks memory and misses untagged entries after mutations |
| FA-L4406 | Med | error-handling | C | discord-fetch retries non-idempotent POST/PUT on 5xx with no idempotency key |
| FA-L4411 | Med | error-handling | C | freescout POST helpers retried on 5xx/network error create duplicate customers and users |
| FA-L4417 | Med | under-eng | C | framework_validation.sql column-preservation check only validates one of five declared tables |
| FA-L4422 | Med | under-eng | C | framework_validation.sql array-dedup check never executes its query and always fires |
| FA-L4427 | Med | sec | C | Gemini API key placed in the request URL query string |
| FA-L4432 | Med | sec | C | Email 'recipient_hash' uses a reversible 32-bit hash — false PII protection |
| FA-L4437 | Low | dependency | C | edge-rate-limit.ts spins its own service-role client, bypassing the centralized admin-client |
| FA-L4442 | Low | error-handling | C | discord-fetch caps Retry-After at 15s — ignoring Discord's requested backoff risks a Cloudflare ban |
| FA-L4448 | Low | error-handling | C | config.toml comments claim service-role auth accepts JWTs / sb_secret_ tokens it actually rejects |
| FA-L4453 | Low | under-eng | C | Three hand-rolled constant-time comparators instead of one shared primitive |
| FA-L4458 | Low | error-handling | C | logger redaction recurses with no depth or cycle guard |
| FA-L4463 | Low | boundary | C | Per-isolate rate/breaker/concurrency state advertised as fleet-wide protection |
| FA-L4468 | Low | under-eng | C | WAF docstring promises body-SQLi scanning and internal-caller skip the code never implements |
| FA-L4473 | Low | error-handling | C | WAF security-event logging is awaited on every block, amplifying the DoS it detects |
| FA-L4478 | Low | under-eng | P | Compliance sanctions list stores subdivision codes unreachable by alpha-2 country screening |

### Catch-all: app entry, assets, generated, tests & repo tooling
| ID | Sev | Dim | St | Title |
|---|---|---|---|---|
| FA-L4488 | High | sec | C | Production CSP allows 'unsafe-inline' scripts — XSS mitigation effectively off |
| FA-L4493 | High | ownership | C | Runtime paging severity depends on a committed generated snapshot with no blocking CI gate to keep it fresh |
| FA-L4498 | High | under-eng | C | Boot unregisters every service worker + purges caches on every load; push/PWA/offline permanently dead |
| FA-L4503 | Med | sec | C | CSP img-src allows any HTTPS origin ('https:' wildcard) — a live exfiltration channel |
| FA-L4509 | Med | sec | C | Full internal edge-function inventory (incl. verify_jwt:false admin functions) shipped in the client bundle |
| FA-L4514 | Med | under-eng | C | Dead PWA/offline assets shipped to production; sw-push.js references a build plugin that does not exist |
| FA-L4519 | Med | ownership | C | Production Supabase URL and anon key hardcoded in the build smoke test |
| FA-L4524 | Med | error-handling | C | post-build-smoke silently skips the prod-config assertion for any bundle containing a localhost Supabase URL |
| FA-L4530 | Med | other | C | arch-gate waiver matching uses substring includes() — a short waiver path silently disables a rule tree-wide |
| FA-L4535 | Med | under-eng | C | arch-gate swallow/empty-catch detectors are narrow and skip SQL — false confidence in the gate |
| FA-L4540 | Med | under-eng | C | Shared test setup mock resolves every query to array-shaped success, including .single()/.maybeSingle() |
| FA-L4545 | Med | error-handling | C | Sitemap generator swallows DB fetch failure and drops all dynamic project-opening URLs silently |
| FA-L4550 | Med | ownership | P | Sitemap advertises 'slug' URLs while SPA route + edge fn key off ':projectId' — public SEO URLs may be dead |
| FA-L4556 | Low | under-eng | P | Sitemap dynamic project-openings query is unbounded — silent truncation at scale |
| FA-L4562 | Low | error-handling | C | Frozen boot block has floating SW/cache promises with no rejection handling |
| FA-L4567 | Low | ownership | C | Committed sitemap.xml is a stale duplicate of generator output; static route list lives in two places |
| FA-L4572 | Low | under-eng | C | Self-destruct SW broadcasts a cache-purge message with no client-side listener |
| FA-L4577 | Low | boundary | C | Inconsistent route protection: public opening-detail vs protected list/apply, reset-password wildcard |

---

## Diff notes for the October comparison

- **FA count reconciliation:** header declares 837 (179H/430M/228L). This inventory lists every
  High and the Medium/Low under each of the 46 sections; a handful of Medium/Low rows in the very
  first sections (lines 59–663) are included above. If an October row's title has no FA match, treat
  it as NEW; a FA title with no October match is a candidate RESOLVED.
- **Cross-doc overlap (do not double-count when scoring):** SEC-C1 ≈ FA edge-auth unsigned-JWT /
  FA-L4390; SEC-C3 ≈ FA-L3396/FA-L3417 (Freescout identity); SEC-H2 ≈ FA-L4277 (project_roster/profiles RLS);
  SEC-H5 ≈ FA-L4395 (idempotency anon scope); SEC-H7 ≈ FA-L3508; SEC-H1 ≈ FA-L2873/FA-L4183 (Turnstile);
  SEC-H14 ≈ FA-L4188 (edge-deploy-smoke); SH-P0-2/C3 ≈ SEC-H14; SH-P1-4 ≈ FA-L4282 (run_auto_remediations);
  SH-P0-3/P0-4 ≈ FA audit-log retention/erasure (FA-L4308, FA-L2262).
- **Already resolved per the docs:** only RF-01…RF-04 (MFA sign-out race / cache / quiet-window; dead
  opaque-script monitor). Everything else in SEC/SH/FA is OPEN as of August.
- **STAT vs the rest:** STAT (2026-08-16) says "clean / zero prod high-critical," which contradicts
  the live P0s in SEC/SH/FA (2026-08-08, same tree era). STAT is static-pattern only. Flag any October
  "clean" verdict against the deeper audits the same way.
