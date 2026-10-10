# Compliance & Data-Lifecycle Audit — TechFleet Network

**Auditor dimension:** GDPR/CCPA data-subject rights, consent & minimization, tamper-evident
audit logging, data classification + retention/deletion, safe migrations, backup/DR, DPIA.
**Scope:** read-only review of `C:/Users/morga/Documents/tfn-audit`.
**Date:** 2026-10-09. **Standard:** `compliance-data-lifecycle` SKILL + references.
**Evidence states:** VERIFIED = read in source this session · INFERRED = concluded from
source cross-reference · UNVERIFIED = depends on prod runtime/secrets/vendor config I cannot see.

**Overall limitation (applies to every finding):** This is a static read of the repo at one
worktree. I did not run the DB, the gates, or the edge functions; I cannot see prod secrets
(e.g. whether `BRAINTRUST_API_KEY` is set), prod cron state, the Supabase project backup tier,
or any signed vendor DPAs. "Documented" ≠ "applied in prod" — migrations here are hand-applied
(`supabase db push`), so code presence is necessary but not sufficient.

---

## Score: 62 / 100 — Band: ADEQUATE, MATERIAL RISK (60–74)

| # | Sub-criterion | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | Right-to-erasure completeness (incl. integrations) | 25% | 55 | 13.75 |
| 2 | Tamper-evident audit logging | 15% | 70 | 10.50 |
| 3 | Retention & deletion policy (documented + enforced) | 15% | 72 | 10.80 |
| 4 | Consent capture + data minimization | 15% | 80 | 12.00 |
| 5 | Third-party / subprocessor governance (incl. Braintrust) | 15% | 45 | 6.75 |
| 6 | Backup/DR + safe migrations + classification/DPIA | 15% | 55 | 8.25 |
| | **Total** | **100%** | | **62.05** |

The DB-internal privacy engineering is genuinely good — above what most startups of this size
have. The score is held down by two things the system does *not* do: erasure stops at the
database boundary and never reaches the third-party systems that hold the same PII, and the
Braintrust export of verbatim member Q&A is wired to default-ON while its own blocking
governance (DPA, opt-out, deletion cascade) is unbuilt.

---

## CRITICAL findings

### C-1 · Erasure does not propagate to third-party integrations (orphaned PII)
Both deletion entrypoints stop at the Postgres/Storage boundary. `delete-account` and
`admin-purge-auth-user` delegate the cascade to the DB trigger `handle_user_deletion()`
(BEFORE DELETE on `auth.users`), and that function's definitive body touches **only** `public.*`
tables and the `handoff-deliverables` storage bucket.

- **Evidence:** `supabase/migrations/20260911120000_erasure_completeness_reconcile.sql:23-105`
  (the authoritative `handle_user_deletion()` — I grepped it for
  `discord|freescout|airtable|braintrust|octopus`: **no matches**).
  `supabase/functions/delete-account/index.ts:73-88` (single `auth.admin.deleteUser`, trigger
  does the rest). `admin-purge-auth-user/index.ts:151-170` clears only
  `suppressed_emails`, `failed_login_attempts`, `email_unsubscribe_tokens`, `rate_limits`.
- **What's orphaned:** Discord membership/roles (keyed on `discord_user_id`), Freescout customer
  + support tickets (`freescout_customer_id`), Airtable certification records (certs read live
  from Airtable per the Airtable-teardown memory), EmailOctopus newsletter subscribers, and —
  once enabled — Braintrust Q&A (see C-2). Edge functions that write to each of these exist
  (`manage-discord-roles`, `freescout-provision-customer`, `freescout-sync-customer`,
  `email-octopus-sync`), but none is called on erasure.
- **Why it's CRITICAL:** a GDPR Art. 17 / CCPA erasure request that returns "done" while the
  member's identity and support history still live in Discord, Freescout, Airtable and an email
  marketing platform is an *incomplete erasure* — the exact failure the skill's
  deletion-propagation reference calls a compliance failure ("Third parties / subprocessors that
  received the data — propagate the deletion").
- **Evidence state:** VERIFIED (code) / INFERRED (that these integrations hold live PII — from
  the integration edge functions + the memory index). **Limitation:** Gumroad and the LLM
  inference providers are legitimately out of self-serve reach; the finding is about the
  integrations TFN *can* call and doesn't.
- **Smallest fix:** enqueue a durable per-integration purge-by-id job on deletion (the ADR-0073
  item-6 pattern), idempotent + paged; record each propagation in `audit_log`; add the
  integrations as rows in the data inventory.

### C-2 · Braintrust exports verbatim member Q&A + real user_id, default-ON, with its governance unbuilt
`_shared/observability/braintrust.ts` streams the full member question and answer, plus the DB
`user_id` as span **metadata** (deliberately un-scrubbed — `braintrust.ts:31,116-123,207-223`),
to Braintrust. Only secrets are scrubbed; names/emails/free-text prose are retained by design
(`scrubSecretsOnly`, ADR-0073 §2). The kill switch **defaults ON when unset**
(`braintrustEnabled()` returns true whenever `BRAINTRUST_API_KEY` exists and the flag is not an
explicit off value — `braintrust.ts:119-123`).

ADR-0073 §6 lists as **blocking-before-prod** follow-ups that are *not yet built*: sign the DPA
(no-training/no-secondary-use + SCCs/UK-IDTA), set Braintrust retention to 30 days, add it to
the subprocessor register + privacy notice, write the LIA, add an in-app opt-out, and **build
the deletion cascade** (purge-by-`user_id` job). `docs/adr/0073-...md:39-40,53,66-68` + Follow-ups.

- **Why it's CRITICAL (contingent):** if `BRAINTRUST_API_KEY` is set in prod, special-category
  free-text PII leaves to a US processor with (per the ADR's own text) no signed DPA, no
  opt-out, and no erasure path — a PII transfer to a third party without a verified lawful
  mechanism, and a permanent erasure gap (deletion cascade absent; only the 30-day TTL, itself
  unverified, would eventually expire it).
- **Evidence state:** VERIFIED (code defaults ON; ADR lists governance as unbuilt).
  **Limitation:** whether the API key is set in prod is UNVERIFIED — the memory index says
  prod-enable is gated on secrets/DPA, suggesting it may not be live yet. If the key is unset
  this is latent, not active; the *posture* (ON-by-default with blocking items open) is the
  finding regardless.
- **Smallest fix:** flip the default to OFF (opt-in to enable) until item-6 artifacts exist;
  ship the deletion-cascade job before any key is set.

---

## HIGH findings

### H-1 · No verified backup / disaster-recovery posture (no RTO/RPO, no restore test, no DR runbook)
There is no evidence of a defined RPO/RTO, a tested restore, or a DR runbook. The
enterprise-readiness brief itself lists this as an *open action*: "REL — DR. Confirm PITR is
enabled and *test a restore*; write a DR runbook."

- **Evidence:** `docs/enterprise-readiness-brief.md:224` (VERIFIED). `docs/runbooks/db-retention.md`
  bounds DB growth to fit the "$25/mo included balance" (line 3) — a low Supabase tier where
  point-in-time recovery is typically a paid add-on, so even baseline daily backups should not be
  *assumed*. `grep RTO|RPO|PITR|restore|backup|disaster` over `docs/` surfaces only this action
  item and the growth runbook — no DR plan.
- **Why HIGH not CRITICAL:** Supabase managed Postgres almost certainly has *some* automated
  backup by default, so "no backup at all" is unlikely — but an **untested** backup with no
  RTO/RPO is, per the skill, "a hope," and the deletion-vs-backup policy (how deleted PII is kept
  out of restores) is undocumented. **Evidence state:** INFERRED/UNVERIFIED (depends on the prod
  Supabase tier, which I can't see).
- **Smallest fix:** confirm/enable PITR, run one documented restore drill, record measured
  RTO/RPO, and add a one-page DR runbook stating deleted data is not restored to prod.

### H-2 · Audit-log tamper-evidence is defeatable by the service role; no off-box copy
`audit_log` (and `admin_promotions`) carry a real SHA-256 hash chain (`prev_hash`/`row_hash` via
`tg_hash_chain()`), a verify function, a DELETE-block trigger, and are retention-exempt — a
strong design. But the chain lives in the same database the app's service role fully controls,
and a **recompute/backfill** routine exists that rewrites `prev_hash`/`row_hash` in place.

- **Evidence:** chain + trigger `supabase/migrations/20260423204012_...:260-296`; verify loop
  `:333-349`; recompute-in-place `20260423204205_...:18-21` (VERIFIED). No forwarding to an
  external SIEM / separate security account was found.
- **Why it matters:** the skill requires audit logs "protected from modification/deletion — even
  by admins whose actions they record," ideally via write-once storage or forwarding "to a
  separate … account so a compromised app can't erase its own trail." Here a service-role actor
  can disable the DELETE-block trigger, edit rows, and re-run the recompute to produce a
  self-consistent (forged) chain. Tamper-*evident* against naive edits; not tamper-*resistant*
  against the privileged account.
- **Secondary (MEDIUM, same area):** the chain reads the predecessor with
  `ORDER BY created_at DESC … LIMIT 1` (`:277`) — concurrent inserts can read the same `prev_hash`
  and fork/duplicate the chain under load, weakening the integrity guarantee.
- **Evidence state:** VERIFIED (mechanism). **Limitation:** I did not confirm who holds EXECUTE on
  the recompute function in prod.
- **Smallest fix:** forward audit rows to an append-only external sink (or Supabase logflare/
  separate project) and tighten/remove prod EXECUTE on the recompute routine; serialize the
  chain write (advisory lock) to kill the race.

---

## MEDIUM findings

### M-1 · No organization-wide data inventory / map; classification is scoped to one subsystem
`docs/compliance/spf-handoff-data-classification.md` is a solid Public/Internal/Confidential/
Restricted inventory — but it explicitly covers only the SPF/hand-off subsystem and marks email
"out of scope" (`:29-31`). There is no equivalent whole-app map enumerating every PII store
(profiles, applications, Discord/Freescout/Airtable mirrors, Braintrust, email lists) with class,
lawful basis, retention, and "deletion reaches it via." Without that map, C-1's gaps are exactly
what stays invisible. **Evidence:** VERIFIED (doc scope). **Fix:** extend the inventory to all
stores + the four integrations; make it the checklist erasure/export must satisfy.

### M-2 · Runbook describes a soft-delete/grace model the code does not implement
`privacy-runbook.md:36` says "Hard-purge soft-deleted users 24 months after `delete-account`"
and references a dispute window — implying a soft-delete. But `delete-account` performs an
**immediate hard delete** via the BEFORE-DELETE trigger (`delete-account/index.ts:73-88`;
`handle_user_deletion` deletes rows synchronously). `deleted_users_ledger` +
`enforce_retention_policy()` exist (`20260507023714`, `20260809120300`) but govern ledger-row
pruning and web-vitals anonymization, not a user-data grace period. The doc and the code tell
different stories about when PII actually disappears. **Evidence state:** INFERRED (doc vs code
mismatch). **Fix:** reconcile the runbook to the real immediate-erasure behavior, or implement
the soft-delete it describes.

### M-3 · DSAR fulfillment is manual; no SLA-breach enforcement in code
`dsar-submit` writes a `dsar_requests` row via `submit_dsar` and returns `sla_days: 30`
(`dsar-submit/index.ts:65-76`); fulfillment is then a human workflow in the admin Privacy tab
(`privacy-runbook.md:31`). `export_my_data()` and the erasure trigger exist to *support* the
operator, but nothing enforces the 30-day clock or auto-executes access/erasure — the quarterly
checklist (manual) is the only backstop. Acceptable at 767 users, but it is operator-dependent
and will not scale or survive an absent operator. **Evidence:** VERIFIED. **Fix:** a due-date
monitor that alerts on any `dsar_requests` past `due_at`.

---

## LOW findings
- **L-1 · `admin-purge-auth-user` uses an inline CORS allow-list** (`index.ts:23-27`) rather than
  the shared `_shared/http.ts` owner that the project's own rules mandate — a consistency/drift
  smell in a privileged deletion path (not a data-leak on its own). VERIFIED.
- **L-2 · Sanctions screening is country-level only** (`_shared/compliance.ts:20-37`) with
  per-name SDN screening explicitly deferred — fine to note as a known limitation, not a privacy
  gap. VERIFIED.

---

## Strengths (credit where earned)

1. **DB-internal erasure is rigorous and regression-guarded.** `handle_user_deletion()` hard-
   deletes ~15 owned tables, de-identifies the financial ledger (retains the tax record, nulls
   the person + redacts email/raw_payload), preserves consent proof while stripping identifiers,
   handles append-only logs transactionally, and best-effort-deletes storage blobs with an
   audit row on failure. The two-migration clobber that silently dropped half the erasure was
   *caught and fixed* with a definitive reconcile migration, a CI guard
   (`check-erasure-completeness.mjs`), and a pgTAP test (ADR-0039). This is mature practice.
   (`20260911120000_...:1-105`, VERIFIED.)
2. **Real consent engineering + minimization.** First-party consent mirrored to `cookie_consents`,
   region-aware opt-in/opt-out defaults, `navigator.globalPrivacyControl` honored, versioned
   consent with re-prompt, analytics loaded only post-consent, a Playwright CI gate that fails
   the build on any pre-consent tracker hit, logger PII redaction, and a data-minimizing age gate
   that stores `birth_year` only. (`privacy-runbook.md:8-72`, VERIFIED.) DPIAs exist
   (`spf-handoff-dpia.md`, `email-octopus-dpia.md`), and migrations are disciplined (expand/
   contract gate, schema-present gate, pgTAP) — the *data-migration-safety* half of this
   dimension is strong.

**Biggest single limitation of this audit:** I could not verify prod runtime state —
specifically whether `BRAINTRUST_API_KEY` is set (which determines whether C-2 is active or
latent) and the Supabase backup/PITR tier (which determines how bad H-1 really is). Both
conclusions rest on code + docs, not on the running system.
