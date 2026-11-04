# Compliance & Data Lifecycle: Re-audit 2026-10-30

**Dimension:** GDPR/CCPA-CPRA data-subject rights (access, erasure incl. processors, rectification), consent,
minimization, classification, retention, DPIA, tamper-evident audit logging, processor inventory, backup/DR,
SOC 2 / ISO 27001 control mapping.
**Repo:** `C:\Users\morga\Documents\tfn-reaudit` at `e4c366190` (origin/main, committed 2026-10-17). Read-only.
**Standard:** `compliance-data-lifecycle` SKILL.md; evidence per `skeptical-audit/references/evidence-discipline.md`.
**Baseline:** `docs/audit/details/compliance-data-lifecycle.md` (2026-10-09, score 62).

**Overall limitation:** static read of the repo plus one gate run. I had no prod access: I did not see prod
secrets (`BRAINTRUST_API_KEY`, `BRAINTRUST_COMPLIANCE_READY`), the prod schema (FKs added outside migrations),
cron state, the Supabase plan/PITR tier, vendor DPAs, or vendor-side retention. Migrations are hand-applied,
so "in a migration" does not mean "live in prod."

---

## Score: 56 / 100. Band: WEAK (40-59). Delta vs prior: -6

| # | Sub-criterion | Weight | Prior | Now | Weighted |
|---|---|---|---|---|---|
| 1 | Erasure completeness (DB + processors) | 25% | 55 | 45 | 11.25 |
| 2 | Tamper-evident audit logging | 15% | 70 | 50 | 7.50 |
| 3 | Retention & deletion (documented + enforced) | 15% | 72 | 62 | 9.30 |
| 4 | Consent + minimization | 15% | 80 | 72 | 10.80 |
| 5 | Processor / subprocessor governance | 15% | 45 | 55 | 8.25 |
| 6 | Backup/DR + migrations + classification/DPIA | 15% | 55 | 58 | 8.70 |
| | **Total** | | **62** | | **55.8 -> 56** |

**Why the delta (honest reading):** the code did not get worse. Two real improvements landed since 10-09:
the Braintrust compliance gate (#433, fail-closed, which takes the export of member Q&A with no DPA from
"default-ON" to "default-OFF") and a backup/DR runbook draft (#431). The score dropped because this pass
looked deeper and found defects the prior audit missed. All of them existed before 10-09:
(a) at least 10 local tables keep a deleted user's PII and are not covered by `handle_user_deletion` or the
erasure gate, (b) the audit-log hash chain breaks itself through trigger ordering and through the erasure
trigger, (c) `export_my_data` has not changed since March and leaves out most of the PII stores, and
(d) H3 is still open. On the prior audit's evidence alone, the current code would score about 64. On the
fuller evidence, it is 56.

---

## Processor inventory

"Deletion on erasure" means: does account deletion (`delete-account` / `admin-purge-auth-user` -> `auth.users`
DELETE -> BEFORE DELETE triggers) reach that processor's copy?

| Processor | PII held | Where written (file:line) | Deletion on erasure? | DPA documented? |
|---|---|---|---|---|
| Supabase (Postgres, Auth, Storage), US | all primary PII | system of record | **Partial**: `handle_user_deletion` `20260911120000_erasure_completeness_reconcile.sql:23-105`. 10+ tables orphaned (CMP-2) | not found in repo (not-assessed) |
| EmailOctopus | email, first name, subscription status | `_shared/email-octopus/client.ts`; sync table `20260822120000_email_octopus_sync.sql:25-33` | **Y (queued)**: `20260822150000_eo_contact_delete_on_account_deletion.sql:46-62` enqueues a `deleted` desired state; worker calls EO DELETE `_shared/email-octopus/client.ts:85`. Not covered by the erasure gate | DPIA `docs/compliance/email-octopus-dpia.md`; signed DPA not-assessed |
| Discord | discord_user_id <-> TFN identity; TFN-granted roles (membership, project) | `manage-discord-roles/index.ts` (add/remove), `discord_role_grant_queue` `20260418201529_...sql:367-375` | **N**: no role removal or member cleanup on erasure. The only DELETE call is the manual role `remove` action `manage-discord-roles/index.ts:401-413` | none found |
| Freescout (self-hosted on PikaPods, `bulky-kagu.pikapod.net`) | customer name and email, support ticket history | `_shared/freescout.ts:344-356` (createCustomer), `freescout-provision-customer`, `freescout-sync-customer` | **N**: local `support_*` rows are deleted (`reconcile.sql:73-82`); the Freescout customer and conversations stay | none found (PikaPods is the host/sub-processor) |
| Airtable | certification records (name, email, cohort fields) | read live by `fetch-class-certifications/index.ts:264-276` and `fetch-project-certifications/index.ts:~264`, which **also mirror into** `class_certifications` / `project_certifications` (email + raw_data) | **N** at Airtable, and **N locally** (the mirror tables are not erased, CMP-2) | none found |
| Braintrust (US) | verbatim Fleety Q&A + DB user_id | `_shared/observability/braintrust.ts:230-246`; callers techfleet-chat, fleety-review, fleety-extract | **N**: no purge job exists. Latent, because emission is gated OFF (`braintrust.ts:121-146`) | runbook checklist unchecked `docs/runbooks/braintrust-prod-enable.md:16-24` |
| OpenRouter (+ US inference providers), Anthropic | member Q&A, application/hand-off content | `techfleet-chat/index.ts:91`, `_shared/llm/port.ts:52`, `_shared/llm/anthropic.ts:21`, `fleety-review/index.ts:36` | N/A (transient inference). Provider-side retention not-assessed | "owner action, flagged" `docs/compliance/spf-handoff-control-matrix.md:18` |
| Lovable AI gateway | translation strings, error-triage text (may carry PII), content gaps | `triage-error/index.ts:212`, `translate-*`, `fleety-learning-digest/index.ts:367`, `prewarm-ugc-worker/index.ts:12` | N/A (transient). Retention not-assessed | none found |
| Google Gemini (generativelanguage) | uploaded content for vision/embeddings | `fleety-extract/index.ts:74`, `_shared/gemini-embed.ts:25` | N/A (transient) | none found |
| Resend | recipient email + message body | `_shared/email/infrastructure/resend-provider.ts:28` | N (provider send logs) | none found |
| Gumroad | buyer email, purchases (Gumroad is merchant of record, a separate controller) | inbound `gumroad-webhook`; local `gumroad_sales` | local de-identified `reconcile.sql:55-62`; Gumroad side out of scope (separate controller) | n/a |
| Google Analytics 4, Microsoft Clarity (session replay), CookieYes | pseudonymous IDs, page paths, session recordings | `src/lib/consent/loadAnalytics.ts:34-77`, `src/components/AnalyticsTracker.tsx:22-27` | N (vendor retention). Consent-gated, GPC honored `loadAnalytics.ts:87` | none found; Clarity masking config not-assessed |
| Cloudflare (Pages, Turnstile), hCaptcha, Google OAuth | IP, device signals | `index.html:22` CSP | N/A | none found |

**Bottom line:** of the 6 processors that keep identifiable member PII beyond a request (EO, Discord,
Freescout, Airtable, Braintrust, Resend), **only EmailOctopus has a deletion path.** No public subprocessor
list exists. The Privacy Policy only says "service providers ... under written contracts"
(`supabase/functions/seed-content/policies/Privacy-Policy.md:89`).

---

## Findings

| ID | Sev | Location | What | Why it matters | Evidence | Re-runnable source | Limitation | Smallest fix (prevent -> gate -> discrimination test) |
|---|---|---|---|---|---|---|---|---|
| **CMP-1** | **Critical** | `20260911120000_erasure_completeness_reconcile.sql:23-105`; `delete-account/index.ts:73-88`; `admin-purge-auth-user/index.ts:140-181` | Erasure stops at Postgres plus the EO queue. Discord roles, the Freescout customer and tickets, Airtable cert records, and (once enabled) Braintrust traces survive account deletion | GDPR Art. 17 + Art. 19 (notify recipients), CCPA delete-with-service-providers. A "deleted" member is still identifiable at 3-4 processors | **observed** (code): Grep `method:\s*"DELETE"` over functions finds only the Discord manual role-remove and the EO client. Grep for external calls in the deletion triggers finds only the EO enqueue | `rg -n 'method:\s*"DELETE"' supabase/functions`; read `reconcile.sql` and `20260822150000` | Did not test vendor APIs. Discord is controller of its own account data; the finding covers TFN-granted roles and the identity link | **Prevent:** one durable `erasure_propagation` outbox written by a BEFORE DELETE trigger with one row per processor (copy the EO pattern `20260822150000`), plus per-processor workers (Freescout DELETE customer, Discord strip TFN roles, Airtable delete or redact records, Braintrust purge by user_id), each writing the outcome to `audit_log`. **Gate:** extend `check-erasure-completeness.mjs` with a `REQUIRED_PROCESSORS` list that must each have an enqueue in an auth.users BEFORE DELETE trigger. **Test:** smoke test that removes the Freescout enqueue and asserts the gate fails; pgTAP that deleting a user produces N outbox rows |
| **CMP-2** | **High** | tables: `class_certifications` (`20260326142945:3-11`), `project_certifications` (`20260327221504:3-11`), `application_confirmation_outbox` (`20260609014743:65-67`, recipient_email), `community_agreement_signatures` (`20260518213456:33`), `trusted_devices`, `device_binding_nonces` (`20260424164707:7,41`), `notification_outbox`, `notification_dlq` (`20260418193836:5,37`), `project_blast_recipients` (`20260513022203:35`), `announcement_actions` (`20260602230537:5`), `discord_role_grant_queue` (`20260418201529:369-370`), `fleety_turn_signals` rows with NULL conversation_id (`20260503193117:11-13`, `user_query` free text) | These tables hold user_id plus PII, have **no inline FK cascade, no later FK constraint, and are not in `handle_user_deletion`**. The erasure gate passes because its `REQUIRED` list is a hand-kept list of 12 tables, not derived from the schema | Local orphaned PII after "delete my account" (email, raw Airtable fields, device keys, free-text questions). The gate shows green while erasure is incomplete | **inferred** from observed facts: (1) the CREATE TABLE text shows no `REFERENCES auth.users`; (2) a multiline search for `references auth.users` within 200 chars of each table name returned none; (3) a search for `FOREIGN KEY (user_id)` near these tables returned none; (4) `DELETE FROM` these tables appears only in TTL jobs. Gate run: `node scripts/ci/check-erasure-completeness.mjs` -> exit 0, "covers all 12 registered PII tables" | the commands above; `scripts/ci/check-erasure-completeness.mjs:41-54` | Prod may have FKs added outside migrations (schema drift). Confirm with `SELECT conrelid::regclass FROM pg_constraint WHERE confrelid='auth.users'::regclass` in prod | **Prevent:** add `REFERENCES auth.users ON DELETE CASCADE` (or explicit erase/de-identify) for each table in one expand migration. **Gate:** make the erasure guard schema-derived: fail when any `public` table has a `user_id`/`*_user_id`/`created_by` uuid column and has neither an FK cascade to auth.users nor a mention in the winning `handle_user_deletion` nor an allow-list entry with a reason. **Test:** fixture migration that adds `foo(user_id uuid)` and asserts the gate fails; pgTAP sweep that, after deleting a seeded user, no `public` table holds that user_id |
| **CMP-3** | **High** | `20260423204012_...sql:229-233` (redact trigger), `:288-296` (hash trigger), `20260423204205_...sql:53-69`; `reconcile.sql:45`; `20260423204205:3-26` | Hash chain integrity is broken by design in 4 ways. (a) **Trigger-order bug:** `trg_hash_chain_audit` fires before `trg_redact_audit_error` (PostgreSQL fires same-event triggers in name order, "h" < "r"), so any row whose `error_message` gets redacted is stored with content different from what was hashed, and `verify_audit_chain` will flag it. (b) `handle_user_deletion` runs `DELETE FROM admin_promotions`, a hash-chained table **with no mutation block**, so erasing any user who was ever promoted breaks the chain for every later row. (c) `verify_audit_chain` is never scheduled; it appears only in `docs/SECURITY_INCIDENT_RESPONSE.md`. (d) Prior H6 still stands: the service role can drop the block trigger and recompute in place (`20260423204205:3-26` shows the pattern); `LIMIT 1` predecessor read with no lock (race); no off-box copy | SOC 2 CC7.2 / ISO A.8.15. Tamper evidence that trips on normal operation hides real tampering ("the chain is always broken"), and evidence nobody checks is no evidence | **observed** (trigger names, order of definitions, DELETE in the erasure body, no cron call for verify). **Inferred** that verify now reports broken (not executed; it depends on whether redaction ever changed a row and whether any promoted user was erased) | `Select-String` for `CREATE TRIGGER` on `public.audit_log` (list in report body); `rg verify_audit_chain` | Did not run verify against a DB. Did not check prod trigger list | **Prevent:** rename the hash trigger to sort last (e.g. `zz_hash_chain_audit`), or fold redaction into the hash function. Add `tg_block_mutation` to `admin_promotions`. Replace the hard delete in erasure with in-place pseudonymization done through an audited, re-chaining SECURITY DEFINER path. Serialize the chain with `pg_advisory_xact_lock`. Schedule `verify_audit_chain` daily, alerting on any row. Forward rows to an external append-only sink. **Gate:** a pgTAP test that inserts a row with a redactable `error_message`, then deletes a promoted user, then asserts `verify_audit_chain()` returns no rows for both tables. **Test:** reorder the triggers back and the test fails |
| **CMP-4** | **High** | `revoke-recording-consent/index.ts:35-65` | **Prior H3 NOT fixed.** The select, update and insert errors are all ignored, and the function returns `{ok:true}` regardless. The header promises a notification to info@ (`:4-5`) and a "System Health digest job that watches recording_consents" (`:61-63`). **No such reader exists**: `recording_consents` appears only in its migration and this function, and System Health was torn down (ADR-0062) | A consent withdrawal (GDPR Art. 7(3)) can fail silently, and even when it succeeds nobody is told, so the recording keeps being used | **observed** | read the file; `rg recording_consents supabase` -> 2 files | Did not exercise it at runtime | **Prevent:** move the write into one SECURITY DEFINER RPC `revoke_recording_consent(session_ref, reason)` that upserts, writes `audit_log`, and enqueues an admin notification through the existing outbox. Check `error` and return 5xx on failure. **Gate:** extend `no-dropped-supabase-error` to flag a bare `await client.from(...).update/insert(...)` whose result is discarded in `supabase/functions/**`. **Test:** a lint fixture with this exact shape must fail |
| **CMP-5** | **High** | `20260322030549_...sql:36-95` (only definition of `export_my_data`) | The DSAR access/export covers only profile, applications, journey, chat, feedback, notifications and dashboard prefs. It leaves out cohort_registrations, recording_consents, cookie_consents, community_agreement_signatures, certifications, gumroad_sales, handoff submissions, fleety_user_memory, fleety_turn_signals and feedback, email_octopus_contact_sync, dsar_requests, support tickets (Freescout), trusted_devices, and audit_log rows about the user | GDPR Art. 15 / 20, CCPA right to know. The self-serve export (`EditProfilePage.tsx:635`) is incomplete with no warning, and it has not changed in 7 months while ~40 tables were added | **observed** (single definition; content read) | `rg "function public\.export_my_data" supabase/migrations` | Admin-assisted DSAR may add more by hand (not-assessed) | **Prevent:** rebuild the export from the same registry as erasure (one PII-store map drives both). **Gate:** a guard that fails when a table in the erasure registry is missing from `export_my_data`. **Test:** remove one table from the export and the guard fails |
| **CMP-6** | **High** | `docs/runbooks/backup-and-dr.md:3-37` | **Prior H5 partially addressed.** RPO 5 min / RTO 4 h targets are now written down, but every verification step is unchecked. No restore has been run, PITR is unconfirmed, Storage backup is unconfirmed, and there is no owner (`:52`). New: **no erasure replay after a restore.** `deleted_users_ledger` is never inserted into (only DELETEd by retention, `20260809120300:39`), so a PITR restore brings erased members back and nothing records who to re-erase | SOC 2 A1.2/A1.3. An untested backup is a hope. Restoring erased PII is a GDPR breach of the erasure | **documented** (runbook draft); **observed** (no INSERT into the ledger in repo); prod tier **not-assessed** | `rg deleted_users_ledger` -> no INSERT | Supabase dashboard not visible | **Prevent:** write a tombstone (hashed user_id + email hash) to `deleted_users_ledger` in `handle_user_deletion`, plus a post-restore `replay_erasures()` step in the runbook. Run and time one restore. **Gate:** extend the erasure guard to require the ledger INSERT in the winning body. **Test:** the guard fails when the INSERT is removed |
| **CMP-7** | Medium (was C2/H7) | `_shared/observability/braintrust.ts:121-146`; `braintrust.test.ts:20-46`; `.github/workflows/deploy-edge-functions.yml:29-33` | **Gate verified fail-closed:** an unset or falsy `BRAINTRUST_COMPLIANCE_READY` gives `false` even when the key is present, and the test covers it (CI allowlist `ci.yml:960`). Residual risks: (a) the gate is a human attestation; any non-empty value other than 0/false/off/no enables it (e.g. `"pending"` would turn it on); (b) the deletion cascade the checklist requires is still unbuilt (no purge job in the repo); (c) the deploy workflow comment still says the flag "defaults ON" and shows enabling with only `FLEETY_BRAINTRUST_ENABLED=1`, without the READY var. That is misleading, though the gate still holds | Lowered to Medium because nothing is exported by default. It becomes Critical again if someone sets READY before the cascade exists | **observed** (code + test); prod env **not-assessed** | read the files | Did not run the Deno test | **Prevent:** require READY to match a pattern such as `^DPA-\d{4}-\d{2}-\d{2}$`, and build the Braintrust purge-by-user_id worker under CMP-1. **Gate:** a test case where `READY="pending"` must stay OFF. Fix the workflow comment |
| **CMP-8** | Medium | `admin-purge-auth-user/index.ts:184-191`; `reconcile.sql:100-101`; `20260423204012:311-313` | The admin erasure writes the **erased person's email** (`email:${email}`) into hash-chained, append-only `audit_log`, which is never purged or redacted. The erasure body claims "redact-in-place is the admin-erasure path", but **no such function exists**. Also, the `write_audit_log` result is not checked, so a failed write is dropped silently | It keeps exactly the identifier the person asked to remove, permanently, and the skill says audit logs must not hold unnecessary PII. The policy says "up to 7 years", but no purge exists (`20260809120300:20-22` defers it) | **observed** | read the files; `rg "function public\.\w*(redact|erase)\w*audit"` -> only the error-redaction trigger | | Log `sha256(email)` or the user_id only. Check the RPC error. Design the audit_log retention / pseudonymization path together with CMP-3. **Gate:** a lint rule against `email:` in `p_changed_fields` |
| **CMP-9** | Medium | absent: an organization-wide data map, processor register, DPAs; `docs/compliance/spf-handoff-data-classification.md` covers one subsystem only | **Prior M-1 still open.** No `check-untagged-pii` or `check-retention-basis` equivalent. The erasure registry is hand-kept, and that is the root cause of CMP-2 and CMP-5 | Without the map, new PII stores silently miss erasure, export and retention. SOC 2 CC9.2 and ISO A.5.19-5.22 vendor management are unmet | **observed** (Glob of `scripts/ci` and `docs/compliance`) | `Get-ChildItem scripts/ci \| ? Name -match 'pii\|retention\|data-map'` -> only the erasure/audit guards | | Commit `docs/compliance/data-map.json` (store, class, lawful basis, retention, erasure method, export inclusion, processor). Wire the skill's `check-untagged-pii.mjs` and `check-retention-basis.mjs` into the `critical` lane. Drive the CMP-2 and CMP-5 guards from the same map |
| **CMP-10** | Medium | `dsar-submit/index.ts:65-77`; `dsar_requests.due_at` `20260507023714:54` | **Prior M-3 open.** No monitor or alert for DSARs past `due_at`, and fulfillment is manual. The 30-day promise is stricter than CCPA's 45 days and matches GDPR's one month | A missed statutory clock depends on one operator | **observed** (no migration since 08-xx references due_at monitoring) | `rg -i "due_at" supabase/migrations` | Admin UI may show due dates (not-assessed) | A daily cron that writes an ops alert when `status <> 'completed' AND due_at < now() + interval '5 days'` |
| **CMP-11** | Medium | `Privacy-Policy.md:85-127`; `docs/compliance/privacy-runbook.md:36` | **Prior M-2 open.** The policy and runbook describe "24 months after deletion" and a soft-delete grace period, but the code hard-deletes immediately (and the ledger the runbook relies on is never written). The policy names no processors. LLM inference, Clarity session replay and Braintrust are not disclosed as categories | Art. 13/14 transparency. Notice and practice disagree | **observed** | read the files | Counsel judgment on adequacy | Rewrite section 8 to match the real behavior. Add a subprocessor list page generated from the data map (CMP-9) |
| **CMP-12** | Low | `admin-purge-auth-user/index.ts:23-27`; `dsar-submit/index.ts:1` | Prior L-1 open (inline CORS in a privileged deletion path, which the scoped CLAUDE.md forbids). `dsar-submit` is tagged `@edge-public` but requires auth (the tag is wrong) | Drift in privileged paths | **observed** | read the files | | Use `_shared/http.ts`; fix the tag |
| **CMP-13** | Low | `triage-error/index.ts:212` | Client and edge error text is sent to the Lovable AI gateway for triage. Error strings often carry emails and IDs | Unlisted PII flow to an LLM processor | **inferred** (payload content not traced) | read around `:180-230` | Did not trace the payload fields | Apply `redact_sensitive_text`-equivalent scrubbing before the call. Add it to the data map |

---

## Disconfirming-case-first checks (Critical / High)

- **CMP-1:** I tried to *disprove* "no processor deletion" by searching every edge function for HTTP DELETE
  and every `auth.users` BEFORE DELETE trigger. This **found the EO path** (`20260822150000`), so I corrected
  the prior audit, which had listed EO as orphaned. Nothing was found for Discord, Freescout, Airtable or
  Braintrust. Claim holds for 4 processors.
- **CMP-2:** I tried to disprove it in three ways: (1) a multiline search for `references auth.users` within
  200 chars of each table name, (2) a search for `FOREIGN KEY (user_id)` near those tables, (3) a search for
  `DELETE FROM <table>` outside TTL jobs. All came back empty. One residual way it could be wrong: prod-only
  FKs added outside migrations. That stays not-assessed until someone runs the `pg_constraint` query in prod.
  I also checked that the gate is not a broader safety net: it greps a 12-name list (`:41-54`), and the
  pgTAP erasure tests have no catalog sweep (`rg information_schema supabase/tests/*erasure*` -> none).
- **CMP-3:** I checked whether a later migration drops or renames either trigger, which would change the
  firing order (`rg "drop trigger.*(trg_redact_audit_error|trg_hash_chain_audit)"`). Only the original
  re-create drops exist. I checked whether `admin_promotions` has a block trigger: none
  (`trg_block_audit_mutation` is on `audit_log` only). I checked whether verify is scheduled: no `cron`
  reference anywhere.
- **CMP-4:** I searched for any consumer of `recording_consents` that would deliver the promised
  notification: none. I checked RLS in case updates fail silently by design: `rec self revoke` allows UPDATE,
  so the success path works and the failure path is unreported.
- **CMP-5:** I searched for a second, newer `export_my_data` definition: none (single `CREATE OR REPLACE` at
  `20260322030549:36`). Only grants changed later (`20260428032029:82,94`).
- **CMP-6:** I searched for any INSERT into `deleted_users_ledger` (a tombstone that would make restore-safe
  erasure possible): none. Also checked the DR runbook for a completed restore record: every step is still
  unchecked.

---

## Prior findings: status

| Prior | Status now | Evidence |
|---|---|---|
| C1 erasure to external processors | **OPEN (Critical)**, narrowed: EO has a path (the prior audit missed it); Discord/Freescout/Airtable/Braintrust have none | CMP-1 |
| C2/H7 Braintrust default-ON | **MITIGATED -> Medium residual**: gate is fail-closed and tested; cascade unbuilt; attestation is weak | CMP-7, `braintrust.ts:121-146` |
| H3 revoke-recording-consent silent failure | **OPEN, unchanged**; also the claimed notifier does not exist | CMP-4 |
| H5 / H-1 backup/DR | **PARTIAL**: runbook draft with targets; nothing verified; new restore-resurrects-erased gap | CMP-6 |
| H6 / H-2 audit-log tamper-evidence | **OPEN and wider** (trigger order, erasure deletes chained rows, verify never run) | CMP-3 |
| M-1 no data map | OPEN | CMP-9 |
| M-2 runbook vs code | OPEN | CMP-11 |
| M-3 DSAR SLA | OPEN | CMP-10 |
| L-1 inline CORS | OPEN | CMP-12 |
| L-2 sanctions screening | not re-assessed | |

## Strengths (re-verified)
- DB-internal erasure core is sound for what it covers: transactional, idempotent, `to_regclass`-guarded,
  ledger de-identification, consent proof kept without identifiers (`reconcile.sql:23-105`). The guard runs
  in the blocking `critical` lane via its `// ci-lane: critical` marker and has a smoke test
  (`src/test/smoke/check-erasure-completeness.smoke.test.ts`). **Observed:** gate exit 0.
- EO erasure through a durable, idempotent queue (`20260822150000`) is the right pattern to copy for CMP-1.
- Consent: trackers load only after consent, GPC always wins (`loadAnalytics.ts:84-118`), GA Consent Mode v2
  defaults to denied, and a pre-consent tracker e2e exists (`e2e/privacy/no-tracking-without-consent.e2e.ts`).
  Whether it is in the blocking shard set was not re-verified.
- The retention engine is scheduled again and its audit write is fixed (`20260809120300:24-137`).
- Braintrust compliance gate (#433) is a good prevent-by-construction step.

## Fixes: what needs prod/vendor access and what does not
- **No prod access needed (repo-only, testable in CI with pgTAP/node):** CMP-2 (FK/erasure migration +
  schema-derived guard), CMP-3 (trigger rename, admin_promotions block, advisory lock, verify cron, pgTAP),
  CMP-4 (RPC + lint), CMP-5 (export rebuild + guard), CMP-6 tombstone INSERT + guard, CMP-7 READY pattern +
  test + comment, CMP-8, CMP-9 data map + gates, CMP-10 cron, CMP-11 doc, CMP-12. The CMP-1 *enqueue side*
  (outbox rows + gate + pgTAP) also needs no prod access.
- **Blocked on secrets / vendor / prod:** CMP-1 workers' end-to-end proof needs `FREESCOUT_API_KEY` (PikaPods
  instance), the Discord bot token + guild, `AIRTABLE_PAT`/base, and a Braintrust key + project to prove
  deletion with a real test user. CMP-6 restore drill needs the Supabase dashboard (PITR tier). CMP-2
  confirmation needs the prod `pg_constraint` query. Signed DPAs (CMP-9) are an owner/legal action.

## Coverage
Read in full: `delete-account`, `admin-purge-auth-user`, `dsar-submit`, `revoke-recording-consent`,
`_shared/observability/braintrust.ts`, `reconcile.sql`, `20260822150000`, the hash-chain migrations
`20260423204012` (sections 6-8) and `20260423204205`, `20260809120300` (retention), the `export_my_data`
definition, `check-erasure-completeness.mjs`, `backup-and-dr.md`, `braintrust-prod-enable.md`,
`loadAnalytics.ts`, `AnalyticsTracker.tsx`, Privacy Policy sections 6-8. Swept: external hosts across all
edge functions; `user_id`-style columns without an inline cascade across all migrations (about 60 hits,
13 sampled in context); triggers on audit tables; cron schedules; git log since 2026-10-09 (35 commits,
2 migrations, both welcome-flow).
Not covered: every one of the ~60 non-cascade columns (only 13 sampled; more orphans likely); the Welcome
Flow newsletter consent wording; Clarity masking; DPIA content quality; SOC 2/ISO control matrix beyond the
SPF subsystem; L-2.

## Limitations
1. No prod access. The Braintrust env, PITR tier, prod FKs and cron jobs are not-assessed.
2. CMP-3's "verify reports broken" is inferred from PostgreSQL's documented alphabetical trigger order and
   the code. I did not execute it.
3. CMP-2's table list is from a sample. The true orphan count is likely higher.
4. Vendor-side retention and DPAs were not visible.

## Evidence ledger (central claims)
| Claim | State | Source | Limitation |
|---|---|---|---|
| Erasure gate passes on HEAD | observed | `node scripts/ci/check-erasure-completeness.mjs` -> exit 0, 12 tables | only checks its own list |
| Deletion reaches EO only, not Discord/Freescout/Airtable/Braintrust | observed (code) | DELETE-method grep + trigger read | vendor runtime not tested |
| ≥10 local tables orphan PII on erasure | inferred | 3 disconfirming searches empty | prod FK drift |
| Braintrust emission is OFF unless READY is affirmed | observed (code+test) | `braintrust.ts:121-146`, `braintrust.test.ts:36-46` | prod env unknown; test not run here |
| Audit chain self-breaks | inferred | trigger names/order + erasure DELETE | not executed |
| H3 unfixed | observed | `revoke-recording-consent/index.ts:43-65` | runtime not exercised |
| DR restore never tested | documented | `backup-and-dr.md` unchecked boxes | dashboard not visible |

**Conformance vs adequacy:** the erasure gate *conforms* (green) but is not *adequate* (hand-kept list). The
Braintrust gate conforms and is adequate as a default-off control, but not as proof that compliance is
ready. The central claim "a deletion request removes this data everywhere" is **below observed, and false
for at least 4 processors and about 10 tables**, so no "compliant" verdict is possible.
