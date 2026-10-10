# Database Architecture & Data Integrity Audit — TechFleet Network

**Auditor dimension:** Database architecture & data integrity ONLY.
**Target:** `C:/Users/morga/Documents/tfn-audit` (read-only). Supabase Postgres, 728 `.sql`
migrations, ~767 prod users, PostgREST + RPC, 40 pgTAP suites.
**Date:** 2026-10-09
**Overarching limitation (applies to EVERY claim):** I CANNOT connect to the production
database. No `psql`, no Management-API token, no live introspection. Every finding is derived
from **migration source text** (the *declared* schema) and CI config — not from live prod
`pg_class` / `pg_policy` / `pg_proc` state. Where I say "RLS enabled" I mean a migration
contains `ENABLE ROW LEVEL SECURITY`, not that I observed `relrowsecurity=true` in prod. The
repo's own `db-schema-gate` is designed to close exactly this gap, but I could not execute it
(no token). I sampled the recent + security-sensitive migrations; I did not read all 728 line
by line.

---

## Score: 86 / 100 — Band: ENTERPRISE-READY WITH GAPS (75–89)

| # | Sub-criterion | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | RLS correctness & coverage | 0.25 | 90 | 22.5 |
| 2 | RPC / SECURITY DEFINER function security | 0.20 | 88 | 17.6 |
| 3 | Constraints & referential integrity | 0.15 | 78 | 11.7 |
| 4 | Migration safety (expand/contract, apply model) | 0.20 | 82 | 16.4 |
| 5 | Schema-drift gate integrity | 0.10 | 92 | 9.2 |
| 6 | Data ownership / denormalization / PII lifecycle | 0.10 | 88 | 8.8 |
| | **TOTAL** | 1.00 | | **86.2 → 86** |

This is a mature, security-conscious database. The findings below are refinements and
accumulated debt, not systemic failures. No CRITICAL findings.

---

## Genuine strengths (credit earned)

**S1. Near-total RLS coverage, scoped policies.** Of 190 live tables (created − dropped in
migration text), **189 enable RLS**; the one miss is a regex artifact (`create table public.`).
`USING (true)` appears only where it is safe: `FOR ALL TO service_role` (service_role bypasses
RLS anyway — redundant, harmless) or `FOR SELECT` on non-PII reference/catalog data
(course/lesson catalog, i18n strings, policy versions, aggregate stats). User-scoped tables use
`auth.uid() = user_id` (e.g. `request_idempotency` at 20260603000800:24-27). IDOR is pinned by
pgTAP (`handoff_rls_idor_test.sql`, `security_definer_exposure_test.sql`).
- Evidence: `supabase/migrations/20260603000800_*.sql:17-30`; `20260316051305_email_infra.sql:183-197`
- Source: `node /tmp/rls.mjs` (live tables 190, RLS-enabled 189); `rg -i "using\s*\(\s*true"`
- State: VERIFIED (against migration text) · Limitation: not confirmed against live prod.

**S2. SECURITY DEFINER discipline is excellent.** 585 of 589 `SECURITY DEFINER` function
definitions pin `SET search_path` (overwhelmingly `'public','extensions','pg_temp'`), the
canonical anti-privesc hardening. Example: `handle_user_deletion()` at
`20260810130001_h9_complete_erasure_cascade.sql:28-29`.
- Source: `node /tmp/secdef.mjs` → "SECURITY DEFINER function defs: 589 · MISSING search_path: 4"
- State: VERIFIED (migration text).

**S3. The schema-drift gate (`check-db-schema-present.mjs`, ADR-0036) is exemplary.** It
verifies REALITY, not a ledger (the explicit lesson from the `feature_flags` PGRST202 outage):
every declared object across 11 categories (table, extension, type, view, constraint,
rls_enabled, function, index, trigger, policy, column) must exist in prod via the Management
API, or the gate is red. Fails closed on no-token / unreachable / zero-scan / floor-drop /
unterminated dollar-quote / unregistered `%I` fan-out. Sound SQL tokenizer prevents prose/DDL
confusion. Backed by a discriminating smoke test and wired into CI.
- Evidence: `scripts/ci/check-db-schema-present.mjs:1-42`; `.github/workflows/ci.yml:599-618`;
  `src/test/smoke/check-db-schema-present.smoke.test.ts`
- State: VERIFIED (code read) · Limitation: I did not EXECUTE it against prod (no token).

**S4. Migration application is now automated and safe (ADR-0045).** `deploy-migrations.yml`
applies `supabase db push` on merge to main, serialized (`concurrency: deploy-migrations`,
cancel-in-progress false), secret-preflighted, dry-run capable. Gated behind BLOCKING
`migration-smoke` (every migration applies clean from scratch) + the ADR-0036 detector as
belt-and-suspenders. This closes the "human forgets to run the SQL" gap that caused the Discord
PGRST202 outage recorded in memory — a material maturity improvement over the hand-applied model.
- Evidence: `.github/workflows/deploy-migrations.yml:1-50`
- State: VERIFIED (workflow read) · Limitation: cannot confirm the one-time ledger bootstrap ran.

**S5. PII erasure & data-ownership design is thoughtful.** `handle_user_deletion()` erases 14
tables directly + ~20 via `ON DELETE CASCADE`, and H9 closes 4 PII orphans with a
*differentiated* policy: de-identify financial ledger (`gumroad_sales` — legal retention) and
consent records (`cookie_consents` — GDPR accountability), hard-delete operational logs with a
transactional trigger-bypass, `to_regclass`-guarded and idempotent, audit_log retained for the
SOC2 hash-chain. One-owner model enforced (Gumroad ledger→projection; live-derived stats gated).
- Evidence: `20260810130001_h9_complete_erasure_cascade.sql`; `decisions.md §2`
- State: VERIFIED (migration text).

---

## Findings (ranked)

### HIGH

**H-1 — Expand/contract is expand-ONLY in practice; the contract phase for columns never runs.**
There are **zero** real `DROP COLUMN` statements in 728 migrations (the only hit is the example
in `supabase/migrations/CLAUDE.md`). Hundreds of `ADD COLUMN` exist. The documented
expand→contract lifecycle (ADR-0026) is therefore only ever half-completed for columns:
deprecated/superseded columns are added but never dropped. Over 728 migrations this accumulates
dead schema (e.g. onboarding wizard fields, pre-rename leftovers) that readers/types/`select('*')`
still carry, and which widen the PII/attack surface silently. This is *safe* (additive never
breaks running code) but it is schema cruft and a drift between "intended shape" and "live shape."
- Evidence: `rg -i "drop\s+column" supabase/migrations` → 1 hit, in `CLAUDE.md` only.
- Impact: schema bloat, stale columns readable via grants, type drift, harder audits.
- Smallest fix: run a periodic "contract backlog" review — enumerate columns no code references
  and schedule contract migrations; or explicitly accept expand-only and document it in §7.
- Severity rationale: HIGH as process/debt, not as an outage risk. State: VERIFIED.

### MEDIUM

**M-1 — Pervasive `NOT NULL DEFAULT ''` empty-string-as-sentinel antipattern (normalization).**
Text/identity columns are declared `text NOT NULL DEFAULT ''` throughout, including the
**immutable identity key** `discord_user_id` (`20260315203254_*.sql:1`:
`ADD COLUMN ... discord_user_id text DEFAULT '' NOT NULL`). Empty string is used instead of NULL
to mean "unset," so "never set" and "explicitly blank" are indistinguishable, and any uniqueness
assumption on an identity key breaks: many rows legitimately share `discord_user_id = ''`.
decisions.md §2 names `discord_user_id` the identity key, yet its default collides across all
unlinked users. Same pattern on `email`, `first_name`, `portfolio_url`, etc.
- Evidence: `20260315203254_*.sql:1`; `20260315192526_*.sql:3-6`; `20260316021654_*.sql:2`
- Impact: identity-resolution ambiguity, cannot enforce `UNIQUE(discord_user_id)` safely,
  violates "every non-key attribute… nothing but the key" (empty string ≠ absence).
- Smallest fix: for identity/optional columns, prefer `NULL` default + partial unique index
  (`UNIQUE … WHERE discord_user_id <> ''` or `… IS NOT NULL`). Expand-safe.
- State: VERIFIED (migration text).

**M-2 — 4 SECURITY DEFINER functions do not pin `search_path`.** `enqueue_email`,
`read_email_batch`, `delete_email`, `move_to_dlq` (all `20260316051305_email_infra.sql:129-156`)
are `SECURITY DEFINER` with no `SET search_path`. **Exploitability is LOW** because (a) every
internal call is schema-qualified (`pgmq.send/read/delete`), defusing the usual hijack, and (b)
`EXECUTE` is `REVOKE`d from `PUBLIC` and granted only to `service_role` (lines 160-170), which
bypasses RLS regardless. Still a deviation from the "always pin" rule and the lone gap in an
otherwise 585/589 record.
- Evidence: `20260316051305_email_infra.sql:129-170`
- Smallest fix: add `SET search_path TO 'pgmq','public','pg_temp'` to each (expand-safe
  `CREATE OR REPLACE`).
- State: VERIFIED. Limitation: I confirmed they were never redefined later, so they persist.

**M-3 — DDL (`DISABLE/ENABLE TRIGGER`) inside the per-deletion trigger function.**
`handle_user_deletion()` runs `ALTER TABLE … DISABLE TRIGGER` / `ENABLE TRIGGER` on
`support_provisioning_log` and `support_ticket_events` on **every** account deletion
(`20260810130001_*.sql:68-77`). Each takes an `ACCESS EXCLUSIVE` lock on those tables. It is
transaction-safe (rolls back on error), but it is a contention point under concurrent deletions
and couples unrelated support tables' locks to the user-deletion path.
- Evidence: `20260810130001_h9_complete_erasure_cascade.sql:68-77`
- Smallest fix: replace the append-only block trigger with a predicate that permits erasure
  deletes (e.g. `WHEN (… )`), so no runtime DDL is needed; or move support-log erasure to the
  async erasure worker.
- State: VERIFIED.

### LOW

**L-1 — Historical in-place `RENAME COLUMN` (pre-ADR-0026 contract-in-place).**
`20260522031707_*.sql` renames 4 `servant_leadership_* → service_leadership_*` columns in place
on `general_applications` — exactly the §7 "never rename in place" pattern. Predates the
expand/contract rule, applied long ago, so no live risk now; cited as the class the rule exists
to prevent. The scoped `supabase/migrations/CLAUDE.md` now bans it.
- Evidence: `20260522031707_*.sql:2-12`. State: VERIFIED.

**L-2 — `db-schema-gate` is conditional (runs only on migration/gate-input changes).**
`ci.yml:81` skips the drift detector for PRs that don't touch `supabase/migrations/**`. Correct
for cost, but out-of-band prod drift (schema changed with no migration) is only caught on the
*next* migration-touching PR. The ADR acknowledges this is a post-apply detector.
- Evidence: `.github/workflows/ci.yml:81,399`. State: VERIFIED.

**L-3 — Some FKs omit explicit `ON DELETE`** (default `NO ACTION`/restrict). 100 `ON DELETE`
clauses across 50 files show deliberate cascade design, but a minority of `REFERENCES` have none;
NO ACTION can block a parent delete unexpectedly rather than orphan. Non-urgent; worth an audit
pass. State: INFERRED (sampled, not exhaustively counted per-FK).

**L-4 — Referenced skill file missing.** `CLAUDE.md` indexes
`.claude/skills/03-database-rls.skill.md`; it does not exist (only `judge-arch`/`arch-encode`
skill dirs are present). The in-area DB rules live in `decisions.md §1-7` +
`supabase/migrations/CLAUDE.md` instead, so guidance isn't lost, but the index is stale.
- Evidence: `Glob .claude/skills/**` — no `03-database-rls.skill.md`. State: VERIFIED.

---

## Re-runnable sources
- `ls supabase/migrations/*.sql | wc -l` → 728
- `node /tmp/rls.mjs` → live 190 / RLS 189 (tables-without-RLS = `public` artifact only)
- `node /tmp/secdef.mjs` → SECURITY DEFINER defs 589 / missing search_path 4
- `rg -i "using\s*\(\s*true" supabase/migrations` → all service_role or non-PII reference reads
- `rg -i "drop\s+column" supabase/migrations` → 1 (CLAUDE.md example only)
- `rg -i "rename\s+column" supabase/migrations` → 1 real (20260522031707)
- `rg -ci "on delete" ...` → 100 clauses / 50 files
- Gate wiring: `.github/workflows/ci.yml:599-618`, `deploy-migrations.yml:1-50`

## What I could NOT verify (named limitations)
1. **No live prod DB access** — all schema claims are from declared migration text; the
   declared-vs-live reconciliation (the gate's whole job) I could not execute (no token).
2. RLS *coverage* ≠ RLS *correctness* at runtime — I read policy SQL, I did not test every
   policy's USING/WITH CHECK against real rows. pgTAP suites exist but I did not run them.
3. Index-vs-query-pattern / N+1: assessable only against live `EXPLAIN` + query logs, which I
   cannot reach. Indexes on FKs looked present in sampled migrations but I did not prove coverage.
4. I sampled ~40 of 728 migrations (recent + security-sensitive); an issue in an unread middle
   migration could exist.
