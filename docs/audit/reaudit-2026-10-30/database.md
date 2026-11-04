# Database architecture and integrity: re-audit 2026-10-30

**Dimension:** database architecture and integrity (migrations, RLS, grants, SECURITY DEFINER functions,
constraints, indexes, single owner of facts, schema-drift and expand/contract gates, pgTAP).
**Target:** `C:\Users\morga\Documents\tfn-reaudit` at `e4c366190` (origin/main, 2026-10-17), 730 migrations.
**Baseline:** `docs/audit/details/database.md` (2026-10-09, score 86).

**Limitation that covers every claim here:** I had no prod database access. Everything below comes from
the migration text (the declared schema) and CI config. What is actually applied in prod is
**not-assessed**. Migrations are applied by hand before merge, or by `deploy-migrations.yml` if its
one-time activation was done, and I could not tell which.

---

## Score: 77 / 100. Band: enterprise-ready with gaps (75-89). Delta: -9 vs 86

| # | Sub-criterion | Weight | Score | Weighted |
|---|---|---|---|---|
| 1 | RLS coverage and correctness | 0.25 | 88 | 22.0 |
| 2 | SECURITY DEFINER / RPC grant security | 0.20 | 70 | 14.0 |
| 3 | Constraints and referential integrity | 0.15 | 80 | 12.0 |
| 4 | Migration safety (expand/contract, apply model) | 0.20 | 72 | 14.4 |
| 5 | Schema-drift and DB-test gate integrity | 0.10 | 75 | 7.5 |
| 6 | Data ownership, retention, audit-log integrity | 0.10 | 75 | 7.5 |
| | **Total** | 1.00 | | **77.4 → 77** |

**Why the score dropped.** The codebase did not get much worse. Only 2 migrations landed since
2026-10-09, and both are well-formed. Most of the drop comes from a deeper method. This time I worked
out the *effective* function grants instead of only checking for `search_path`, and that surfaced a
recurring privilege-exposure class (DB-1). That class reappeared in migrations from 2026-09-09,
2026-09-18 and 2026-10-10, after the team had already documented the root cause on 2026-08-18. I also
ran disconfirming probes against the new expand/contract guard (DB-3), and I noticed that the pgTAP job
does not block merges (DB-2). Two prior findings were wrong or overstated, and correcting them gave
points back (prior M-2 and part of M-1, see "Prior findings status").

---

## Strengths (re-verified)

- **RLS is on for every live table.** My effective-schema derivation (created, minus dropped, plus
  renames) gives 188 live `public` tables, and all 188 have `ENABLE ROW LEVEL SECURITY` in migration
  text. `observed`. Source:
  `node <scratchpad>/dbaudit.mjs <repo> out.json` → `"liveTables":188,"tablesNoRls":[]`. Limitation:
  tables created through dynamic `EXECUTE format()` (20 sidecar files) are not parsed by my script.
  The repo's own gate extraction lists 204 declared tables and 204 rls_enabled
  (`DB_SCHEMA_EXTRACT_ONLY=1 node scripts/ci/check-db-schema-present.mjs`, exit 0).
- **`search_path` is pinned on 377 of 377 live SECURITY DEFINER functions.** `observed` with the same
  script, `"secdefLive":377,"secdefNoSearchPath":[]`. Limitation: overloads are grouped by name.
- **Every `USING (true)` / `WITH CHECK (true)` policy I checked is justified.** All 32 live ones are
  either `TO service_role` or `FOR SELECT` on non-PII catalog or reference data (i18n, handbooks,
  policy versions, feature flags, membership products). `observed` (script output `policiesUsingTrue`).
- **The new Welcome Flow migrations are well-formed** (`20261010120000`, `20261010120100`). The change
  is expand-only, idempotent and nullable. The count is derived live, with no stored counter, which
  follows ADR-0050. The write RPC is `auth.uid()`-pinned and set-once, and a pgTAP suite exists
  (`supabase/tests/welcome_flow_test.sql`). `observed` (read in full). The one exception is DB-1.
- **The schema-drift gate is still exemplary for object presence** (11 categories, fails closed, has a
  sidecar for dynamic DDL). `observed` (extract-only run above). Limitation: the gate itself says it
  does NOT check privilege state (`check-db-schema-present.mjs:32-34`), and that is exactly where DB-1
  lives.
- **Discord identity is protected by a partial unique index and a column-guard trigger.** The index is
  `idx_profiles_discord_user_id_unique ... WHERE discord_user_id IS NOT NULL AND discord_user_id != ''`
  (`20260407225006:1`). Membership columns are guarded by `trg_guard_profile_membership`
  (`20260803120000:126-179`). `observed`.

---

## Findings

| ID | Sev | Location | What | Evidence state | Re-runnable source | Limitation | Smallest fix (prevent → gate → test) |
|---|---|---|---|---|---|---|---|
| DB-1 | **High** | `20260918131000_founding_discord_role_targets.sql:36-37,106-107`; `20260909120000_gumroad_identity_multi_email.sql:126-128`; `20261010120000_welcome_flow_completion.sql:81-82`; plus older `20260602230329:114` (record_event), `20260602225841:98` (_upsert_kpi), `20260518213456:125` (mark_community_agreement_required), `20260531042114:137` (fill_content_gaps_check_and_inc) | These SECURITY DEFINER functions are meant to be service-role only (or authenticated only), but each one only does `REVOKE ... FROM PUBLIC`. Supabase's default privileges also grant EXECUTE to `anon` and `authenticated` directly, so both roles can still call them over `/rest/v1/rpc/*`. The worst cases: `list_founding_discord_role_targets()` returns `user_id` plus `discord_user_id`, which its own COMMENT calls "CONFIDENTIAL PII — service-role only", and it has no internal guard. `resolve_gumroad_user(email)` is an email-to-user_id oracle that anyone can enumerate. `report_founding_discord_role_gap()` writes an `audit_log` row on every call, so anyone can flood the audit log and grow the hash chain. | `inferred` (from migration text plus the repo's own documented live observation of this exact mechanism) | `Grep "resolve_gumroad_user\|list_founding_discord_role_targets\|report_founding_discord_role_gap" supabase/migrations` shows no later REVOKE from anon or authenticated. `Grep -i "ALTER DEFAULT PRIVILEGES" supabase/migrations` shows only schema `private`, never `public`. The mechanism is documented in `20260818130000_support_rpc_anon_lockdown.sql:3-8`: "Supabase's default privileges grant EXECUTE to anon+authenticated … REVOKEd from PUBLIC … but not from `anon` directly, so … remained anon-EXECUTE-able (verified live 2026-08-18)". The latest anon sweep is `20260818130000`, which runs before these functions exist. | Prod grants not inspected. If the prod project's default privileges were changed by hand in the dashboard, these functions could be safe. Run `SELECT has_function_privilege('anon','public.list_founding_discord_role_targets()','EXECUTE')` in prod to settle it. | **Prevent:** one migration that runs `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;`, then a one-time `REVOKE ... FROM anon, authenticated` on the named functions with explicit GRANTs kept. The 2026-08 audit recommended this (`docs/architecture/audit-2026-08/findings.md:4275`) and it was never done. **Gate:** a pgTAP assertion over `pg_proc WHERE prosecdef AND pronamespace='public'::regnamespace` that every function EXECUTE-able by anon is on a reviewed allowlist (login, rate-limit and public-stats functions). This replaces the hand-picked 13-assertion list in `security_definer_exposure_test.sql`. **Test:** remove the REVOKE from one allowlisted fixture and confirm the suite goes red. Needs DB-2 so it actually blocks. |
| DB-2 | Medium | `.github/workflows/ci.yml:680-733` (db-test), `:410-423` (gate needs) | `db-test` (pgTAP, 40 suites) is not in the `gate` aggregator's `needs`. The comment says "INFORMATIONAL first ... should be promoted". So every RLS, SECURITY DEFINER and IDOR proof the repo relies on (`supabase/migrations/CLAUDE.md` "Prove it") can be red and the PR still merges. | `observed` | Read `ci.yml:407-423`. The `needs` list has migration-smoke and db-schema-gate but no db-test. | I did not check branch-protection settings. db-test could be a separately required check there, but the in-file comment says it is informational. | **Prevent:** add `db-test` to `gate.needs` with skipped-as-pass, the same way as migration-smoke. **Gate:** the aggregator line `[ "$dbt" = success ] \|\| [ "$dbt" = skipped ]`. **Test:** a fixture PR with a failing pgTAP assertion shows gate red. |
| DB-3 | Medium | `scripts/ci/check-migration-expand-contract.mjs:50-56,86-101,104-114` | The new EXPAND-CONTRACT-001 guard (#424) only catches single-line `DROP COLUMN`, `RENAME COLUMN`, `ALTER COLUMN…TYPE` and `SET NOT NULL`. Five problems: (a) it matches per line, so a multi-line `ALTER COLUMN x\n TYPE` passes; (b) it misses `DROP TABLE`, `DROP FUNCTION`, enum `RENAME VALUE`, and `ADD COLUMN … NOT NULL` without a default; (c) one `-- expand-contract-ok:` anywhere in a file waives every destructive line in that file; (d) "shrink-only" is not enforced, because the guard checks only for stale entries and adding a new grandfather entry passes; (e) the contract phase still never runs, with 0 real `DROP COLUMN` in 730 migrations against 194 `ADD COLUMN`. | `observed` (probes) | Probes with `EXPAND_CONTRACT_ROOT=<fixture>`: control `DROP COLUMN` → exit 1; multi-line ALTER TYPE → 0; `DROP TABLE public.profiles` → 0; `DROP FUNCTION public.get_network_stats()` → 0; a file-wide annotation masking a second `DROP COLUMN email` → 0; `ALTER TYPE … RENAME VALUE` → 0; `ADD COLUMN y uuid NOT NULL` → 0. The real corpus gives exit 0 ("730 scanned; 4 grandfathered"). Script output `"dropColumn":0,"addColumn":194`. | I did not confirm the guard runs in the blocking `lint-arch-critical` matrix. That is inferred from its `// ci-lane: critical` marker plus `_guard-lane.mjs:5`. | **Prevent:** run patterns on statement-split, comment-stripped text (reuse `_sql-scan.mjs codeView`). Add DROP TABLE/FUNCTION/TYPE, RENAME VALUE, and ADD COLUMN NOT NULL without DEFAULT. Make the annotation line-scoped (it must sit directly above the statement). **Gate:** pin the grandfather length (`allow.size <= 4`). **Test:** add smoke cases EC-010..016 that mirror the probes above. **Contract backlog:** an explicit ADR that either schedules contract migrations or accepts expand-only. |
| DB-4 | Medium | `scripts/ci/check-db-schema-present.mjs:73` vs `.github/workflows/deploy-migrations.yml:3-19`; `supabase/migrations/CLAUDE.md:3` | The apply model contradicts itself. `db-schema-gate` is blocking on migration PRs and checks that **every** declared object, including the PR's own new ones, already exists in prod. So a PR adding a table cannot merge until someone applies its SQL to prod by hand, before review is finished. `deploy-migrations.yml` then says it applies the migration on merge. The scoped `CLAUDE.md` still says "hand-applied". The result is that prod receives unmerged SQL, an abandoned PR leaves orphan objects in prod, and the human step ADR-0045 was meant to remove is still required. | `inferred` (from code) | `check-db-schema-present.mjs:73` reads every file in `supabase/migrations` (no git or base-diff filter, `Grep execSync\|git \|GITHUB_` → none). `ci.yml:458-461` requires it to succeed. Memory and PR history also report "migration hand-applied to prod pre-merge" (`reported`). | Whether deploy-migrations was ever activated (ledger bootstrap plus `SUPABASE_DB_PASSWORD`) is not-assessed. | **Prevent:** in PR context, verify only objects from migrations already on the merge base. Verify the PR's new migrations after deploy-migrations applies them (run the gate post-apply on `main`). **Gate:** the post-apply run on main is blocking for the next deploy. **Test:** a fixture with a new-migration table absent from a prod fixture passes in PR mode and fails in post-apply mode. Align `supabase/migrations/CLAUDE.md:3` with ADR-0045. |
| DB-5 | Medium | `20260423204205_*.sql:53-69` (`tg_hash_chain`, latest def); `20260531042114_*.sql:35-50` (cron); `20260315195132_*.sql:83-97` (purge body); `20260423204103_*.sql:1-10` (block trigger) | **Audit-log integrity and retention (prior H6, still open, plus a new related issue).** (a) The hash chain reads the predecessor with `ORDER BY created_at DESC, id DESC LIMIT 1`, with no lock or advisory lock. Two concurrent inserts can read the same `prev_hash`, which forks the chain, and `verify_audit_chain` then reports false tampering. `created_at` is transaction-start time, so verifier order can also differ from commit order. (b) The chain is an unkeyed sha256 with no external anchor, so any actor with DDL rights can drop the block trigger and recompute the chain. (c) **New:** cron `audit-log-daily-purge` runs `purge_old_audit_logs(90)` daily. The append-only trigger `trg_block_audit_mutation` raises on every DELETE, so once any row is older than 90 days the job fails every day and `audit_log` grows without bound. `20260809120300:20-22` acknowledges this ("blocked by the append-only trigger … Tracked separately"). The 90-day argument also conflicts with the function's documented 2555-day default. | `inferred` | `Grep "prev_hash\|row_hash"` → only 2 files, so the `20260423204205` def is the latest. `Grep "unschedule\([^)]*audit"` → none. Read the bodies cited. | Prod cron run history (`cron.job_run_details`) not inspected. Concurrency is not reproduced (no DB). | **Prevent:** `pg_advisory_xact_lock(hashtext(TG_TABLE_NAME))` before the predecessor read, and order by a `bigserial` sequence column instead of `created_at`. Anchor periodic chain heads outside the DB. Replace the purge with an audited erasure path that does not fight the trigger, or unschedule it and record the retention decision in an ADR. **Gate:** pgTAP checks that the cron command matches an allowed retention value. **Test:** a pgTAP case where two inserts in separate sessions (dblink) still give `verify_audit_chain()` = 0 rows. |
| DB-6 | Medium | `20260818120000_security_definer_grant_relock.sql:24-28`; `decrypt_pii` latest def `20260423204012:57` | `decrypt_pii(text)` is granted to all of `authenticated` and has no internal `is_elevated()` guard. The relock migration says "A follow-up adds an internal is_elevated() guard", and that follow-up never landed. Any signed-in member who gets hold of a ciphertext (IP or user-agent in audit_log, failed_login_attempts, passkey tables) can decrypt it. Exposure depends on whether members can read other members' ciphertext, which is limited today, so this is a defense-in-depth gap. | `inferred` | `node <scratchpad>/fnlatest.mjs <migrations> decrypt_pii` → `secdef=true guard=false`. Grep for `is_elevated` inside decrypt_pii → none. | I did not enumerate every RLS path to ciphertext columns. | **Prevent:** add `IF NOT public.is_elevated() AND current_user <> 'service_role' THEN RAISE ... 42501` in decrypt_pii (CREATE OR REPLACE keeps the grants). **Test:** a pgTAP case as a non-admin authenticated user expects `throws_ok`. |
| DB-7 | Medium | `20260520035523_*.sql:187-195` (tables); `src/components/admin/StatsControlsCard.tsx:12` | **A stored total still sits beside the source rows.** After ADR-0050 moved stats to live derivation (`20260918140000/140100`), `network_stats_snapshots` and `course_completion_stats` were never contracted. The admin "Recompute now" control still rebuilds `network_stats_snapshots`, so a second, unused copy of the fact keeps getting written, and `types.ts` still exposes both tables to the app. | `observed` | `Grep "course_completion_stats\|network_stats_snapshots"` across src, functions and migrations shows no `DROP TABLE`, plus the StatsControlsCard writer. | I did not check whether any edge function reads the snapshots. | **Prevent:** a contract migration that drops both tables (annotated), and remove the recompute control. **Gate:** extend `stats-live-derivation.smoke.test.ts` to fail if either table name appears in `src/` or `supabase/functions/`. |
| DB-8 | Low | 249 of 319 live policies (sample in script output) | Policies call `auth.uid()` directly instead of `(select auth.uid())`. Postgres then evaluates it once per row instead of once per statement (Supabase advisor `auth_rls_initplan`). There is no correctness impact. At 767 users the cost is small, but it grows linearly with table size. | `observed` | Script `"policiesBareAuthUid":249,"livePolicies":319`. | The policy count is from my parser, and the gate counts 495 declared because it uses a different method. Not EXPLAIN-measured. | Rewrite hot-table policies (profiles, applications, notifications) to `(select auth.uid())`. A lint guard can flag bare `auth.uid()` in new `CREATE POLICY`. |
| DB-9 | Low | 34 FK columns, e.g. `announcement_reads.announcement_id`, `project_roster.project_id`, `class_module_progress.item_id/class_id`, `community_agreement_signatures.version_id`, `recording_consents.user_id` | These FK columns have no index whose leading column is the FK column. That slows parent DELETE and CASCADE (it needs a seq scan) and slows joins. | `inferred` (approximate parser) | Script `fkNoLeadingIndex` (34). | My parser misses composite indexes declared in DO blocks or with expressions, so some of these may be false positives. | Add `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for the confirmed ones. A pgTAP or catalog query can assert that no FK lacks a covering index. |
| DB-10 | Low | `20260315203254_*.sql:1` (`discord_user_id text DEFAULT '' NOT NULL`); `class_certifications.email`, `project_certifications.email` | The empty-string sentinel is still in place. The prior concern that uniqueness was impossible is **mitigated** by the partial unique index (`20260407225006:1`). What remains is that every reader has to remember `btrim(COALESCE(x,''))<>''`. See `20260918131000:25-28`, where the author had to warn about it. | `observed` | Script `sentinel` list, plus the Grep for the index. | n/a | Expand: allow NULL, backfill `''`→NULL, switch readers to `IS NOT NULL`, then contract the default. |
| DB-11 | Low | `20261010120000:16-17` with profiles UPDATE policy `20260315192853:62-63`; `20261010120100:20` | (a) The migration comment says the completion write goes "never a direct client UPDATE", but the row-scoped profiles UPDATE policy lets a member set or clear their own `welcome_flow_completed_at` directly. The "set-once" rule holds only inside the RPC (self-scoped, low impact). (b) `set_my_marketing_subscription` pins `search_path = public` but not `pg_temp` last. That is consistent with older migrations and low risk. | `observed` | Read cited lines. Grep for profiles UPDATE policies and guard triggers. | n/a | Add `welcome_flow_completed_at` to the existing guard-trigger column set (`guard_profile_membership_columns` pattern) so only the definer RPC can change it. |
| DB-12 | Low | `20260911120000_erasure_completeness_reconcile.sql:74-81` | Prior M-3 is still open. `handle_user_deletion()` runs `ALTER TABLE … DISABLE/ENABLE TRIGGER`, which takes an ACCESS EXCLUSIVE lock, on two support tables during every account deletion. | `observed` | Grep `DISABLE TRIGGER` in the latest def file. | n/a | Use a predicate-based bypass (for example a `SET LOCAL app.erasure = on` checked inside the block trigger) instead of runtime DDL. |

### Disconfirming-case-first record (High)

**DB-1.** The claim I tested: "anon and authenticated can EXECUTE `list_founding_discord_role_targets()`."
I looked for evidence that would prove it false before accepting it:
1. *A later REVOKE on these names?* `Grep` across all migrations: the only references are the defining
   files. None found.
2. *A blanket sweep after 2026-09-18?* `Grep "(REVOKE|revoke)[^;\n]*%[sI][^;\n]*(anon|PUBLIC)"`: the
   latest dynamic sweep is `20260818130000`, which runs before these functions exist. None found.
3. *Default privileges changed for `public` so new functions are not anon-executable?*
   `Grep -i "ALTER DEFAULT PRIVILEGES"`: only `IN SCHEMA private` (3 files). None found.
4. *Is `REVOKE FROM PUBLIC` alone actually enough on Supabase?* The repo's own `20260818130000:3-8`
   records the opposite, observed live on 2026-08-18. The team's newer code also revokes `FROM PUBLIC, anon`
   explicitly (`20261010120000:57`, `20260810110000:29`), so they know.
5. *Does the function guard itself internally?* Its body (`20260918131000:21-29`) is a plain `SELECT`
   with no `auth.*` check. None found.
6. *Does a pgTAP test catch it?* `founding_discord_role_test.sql` and
   `gumroad_identity_multi_email_test.sql` have no `has_function_privilege` or `anon` assertions, and
   db-test does not block anyway (DB-2). None found.

All six checks came back empty, so the finding stands at `inferred`. The one thing that could still
overturn it is a prod-side default-privilege change, which is `not-assessed`.

---

## Prior findings status (2026-10-09 baseline)

| Prior | Status now | Evidence |
|---|---|---|
| H-1 contract phase never runs | **Open.** Still 0 real `DROP COLUMN`. The #424 guard adds friction for destructive changes but has bypasses (DB-3). | `observed` (script, probes) |
| M-1 `NOT NULL DEFAULT ''` sentinel on discord_user_id | **Partly wrong in baseline.** A partial unique index has existed since 2026-04-07, so the uniqueness claim was incorrect. The semantics issue remains, downgraded to Low (DB-10). | `observed` (`20260407225006:1`) |
| M-2 4 SECURITY DEFINER fns missing search_path (email_infra) | **Baseline was a false positive.** All 4 were redefined with `SET search_path = public` the next day, in `20260317212605:3-36`. The baseline's "confirmed never redefined later" was incorrect. They are also locked to service_role (`20260428032029:39-74`). Closed. | `observed` |
| M-3 runtime DDL in handle_user_deletion | **Open** (DB-12). | `observed` |
| L-1 historical RENAME COLUMN | Unchanged. Grandfathered in the expand-contract allowlist. | `observed` |
| L-2 db-schema-gate conditional | Unchanged. Also see DB-4 for the bigger issue with the apply model. | `observed` |
| L-3 FKs without explicit ON DELETE | Not re-counted. Replaced by the more actionable DB-9 (unindexed FKs). | `not-assessed` |
| L-4 missing `.claude/skills/03-database-rls.skill.md` | Not re-checked (out of scope). | `not-assessed` |
| Brief "189/190 tables RLS" | Now 188/188 by effective derivation. | `observed` |
| H6 audit-log hash chain LIMIT 1 race + recompute | **Open** (DB-5a/b), plus a new retention break (DB-5c). | `inferred` |

---

## Coverage statement

- **Read in full:** both migrations added since 2026-10-09; `check-migration-expand-contract.mjs` and its
  allowlist; `deploy-migrations.yml`; `ci.yml` (sections 55-100, 405-470, 560-735);
  `migration-auto-apply.md`; `security_definer_exposure_test.sql`; `20260818120000`; `20260818130000`;
  `20260423204205`; `20260423204103`; `20260317212605`; `20260918131000`; key parts of
  `20260909120000`, `20260503224736`, `20260604170137`, `20260531042114`, `20260315195132`.
- **Pattern-scanned (all 730 files):** my statement-level parser (strips comments, respects
  dollar-quotes) at `C:\Users\morga\AppData\Local\Temp\claude\C--Users-morga-Documents\eb278155-1eeb-43c5-b921-db4953279b71\scratchpad\dbaudit.mjs`
  derives effective tables, RLS, policies, views, functions, SECURITY DEFINER and search_path flags,
  function ACL events, FKs and indexes. The output is in `out.json` in the same folder. The repo's own
  gate ran in extract-only mode (exit 0).
- **Not read:** most of the roughly 700 middle migrations, line by line.

## Limitations

1. No prod access. Applied state, live grants (`has_function_privilege`), cron run history and the
   activation of deploy-migrations are all `not-assessed`.
2. My ACL model does not run the bodies of `DO $$ … EXECUTE format()` sweeps. I found and read the
   sweeps by hand and only flagged functions created after the last relevant sweep. Overloads are grouped
   by name.
3. pgTAP and the npm smoke tests were not run (no node_modules and no Docker, per instructions).
   `node scripts/ci/check-migration-expand-contract.mjs` and the schema gate in extract-only mode were run.
4. The FK-index and bare-`auth.uid()` counts come from an approximate parser and need catalog
   confirmation.
5. The blocking status of `check-migration-expand-contract` in CI is inferred from its lane marker.

## Evidence ledger (load-bearing claims)

| Claim | State | Source | Limitation |
|---|---|---|---|
| 188/188 live tables have RLS enabled | observed | dbaudit.mjs `tablesNoRls: []` | Dynamic-DDL tables not parsed |
| 377/377 live SECURITY DEFINER fns pin search_path | observed | dbaudit.mjs `secdefNoSearchPath: []` | Name-level overload grouping |
| Founding/gumroad/welcome-count fns are anon and authenticated EXECUTE-able | inferred | Grep plus `20260818130000:3-8` documented mechanism | Prod grants not queried |
| pgTAP db-test does not block merge | observed | `ci.yml:410-423` | Branch protection not inspected |
| Expand-contract guard misses 6 destructive forms | observed | 7 fixture probes, exit codes listed in DB-3 | Fixture-based, not CI |
| Audit purge cron fails daily | inferred | Purge body, block trigger, cron schedule, no unschedule | `cron.job_run_details` not read |
| Prior M-2 was a false positive | observed | `20260317212605:3-36` | n/a |

**Conformance vs adequacy.** The migrations *conform* to the repo's written rules (search_path, RLS,
idempotent expand). Those rules are *not adequate* for function privileges: "REVOKE FROM PUBLIC" follows
the convention and still leaves the function exposed on Supabase. Without a catalog-level, blocking
check, the same mistake has come back 3 times in 6 weeks.

**Open gaps (next measurements):** in prod, run `has_function_privilege('anon', …)` over every
`prosecdef` function in `public`; check `cron.job_run_details` for `audit-log-daily-purge`; run
`supabase db push --dry-run` to settle DB-4; run a catalog query for FKs that lack a covering index.
