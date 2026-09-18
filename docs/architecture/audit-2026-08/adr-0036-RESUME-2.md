# ADR-0036 gate — session 2 progress (continues adr-0036-RESUME.md)

## Categories now implemented + extraction-verified against all 711 migrations

All counts match the design's declaredCountApprox:

- table 204, extension 7, type 27, view 19, cron_job 48, constraint 20.

Harness changes this session:

- `_sql-scan.mjs` gained `codeView(sql, {keepStrings})` — keep single-quoted literals (cron job
  names live in strings). cron uses `{keepStrings:true, keepDoBodies:true}`.
- Allowlist subtraction no longer lowercases (`String(nm)`) so `cron_job` matches VERBATIM/case-sensitive.
- cron_jobs has a count-parity tripwire: #`cron.schedule(` calls must equal #literal names extracted, else fail closed.

## REFERENCE_* DYNAMIC LOOP ENUMERATION (needed for the dynamic categories)

Both `20260502180318` (14 tables) and `20260502184658` (5 tables) use the SAME loop template (verify
file2 by reading it). Per reference table `t` the loop dynamically creates:

- **rls_enabled**: `public.<t>` (ENABLE ROW LEVEL SECURITY; also FORCE — separate category if added)
- **indexes** (4): `<t>_search_idx`, `<t>_name_trgm_idx`, `<t>_data_idx`, `<t>_category_idx`
- **triggers** (2): identifier `public.<t>.trg_<t>_updated_at`, `public.<t>.trg_<t>_search`
- **policies** (2): `public.<t> :: Authenticated users can read active <t>`, `public.<t> :: Admins can manage <t>`
- **columns** (same for every ref table, from the format body): `<t>.{id,slug,name,description,category,data,search_tsv,is_active,source,source_row_id,created_at,updated_at}` (12)

RENAME CASCADE in `20260503180621`: renames `reference_team_functions` -> `reference_job_functions`
AND its 6 indexes (`reference_team_functions_*` -> `reference_job_functions_*`) and recreates its
triggers/policies under new names ("Recreate triggers under new names"). `reference_roles` is
DROP TABLE'd (its dynamic objects go too). => Easiest correct approach for the dynamic sidecar of
indexes/triggers/policies/rls/columns: generate names from the FINAL reference-table set (17 tables:
13 unchanged file1 + reference_job_functions; 4 file2 minus reference_roles) x the patterns above,
and list them in db-dynamic-objects.json keyed by the CREATE file. (Since names are listed as final,
no stream rename needed for them.) Confirm file2's loop matches before generating.

## REMAINING (updated, in order)

1. **indexes / triggers / policies / rls_enabled** — name-based, fit deriveNet with per-kind
   create/drop regex + `dynamicRe` + sidecar (finals, above). Counts (design): indexes ~300,
   triggers ~150, policies ~458, rls_enabled ~213 (rls FIX: enable=add / disable=del only, NO
   drop-table subtraction — that was the "broken" bug; assert public.profiles is in the set).
2. **functions** (~409) — custom: identity = `public.name(normalized input arg types)`. Needs
   normalizeType (alias map int4->integer etc.; strip typmod/array/leading public.|extensions.) +
   splitTopLevel + drop arg names/modes/DEFAULTs; match prod `pg_get_function_identity_arguments`
   run through the SAME normalizer, with `SET search_path=public,extensions` on the prod query.
   HIGH RISK of signature-string mismatch → VALIDATE against prod (needs token); count is checkable now.
3. **columns** (~1900) — custom: CREATE TABLE body paren-parse (skip leading constraint keywords
   CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE — do NOT skip `key`/`references`, so feature_flags.key
   is captured) + ALTER ADD/DROP/RENAME COLUMN; reference_* columns via sidecar (12 per table, above).
4. **prod query + fetch + diff** (reuse #339 pattern exactly: exitCode+throw EXIT, no process.exit
   after fetch; fail closed) + `DB_SCHEMA_PROD_FIXTURE` seam. UNION ALL all `prodSelect`s + `SET
search_path=public,extensions;` for functions.
5. **manual-review bucket** (unverifiable effects) + **allowlist seed** `db-schema-allowlist.json`
   `{"table":["tickets","ticket_events"]}`.
6. **smoke test** + BESPOKE registration (check-db-schema-present uses readdirSync; _sql-scan is a `_`
   harness, exempt) + **ADR-0036** + **retire check-db-objects-present** + **CI wiring** + judge-arch + PR.

## Session 2b update — 7 categories + prod/diff wired + generator

- **Prod query + diff WIRED** and verified end-to-end via fixtures: all-present -> exit 0,
  missing -> exit 1 (drift list), no-token/malformed -> exit 2 (fail closed). Seams:
  `DB_SCHEMA_PROD_FIXTURE` (rows [{kind,identifier}]), `DB_SCHEMA_DUMP=1` (emit declared as fixture).
- **7 categories live**: table 204, extension 7, type 27, view 19, cron_job 48, constraint 20,
  rls_enabled 212. The gate is RUNNABLE against prod now (`SUPABASE_ACCESS_TOKEN` + REF).
- **Sidecar generator**: `scripts/ci/gen-db-dynamic-objects.mjs` (run to regenerate db-dynamic-objects.json).
- **indexes DEFERRED** — the tripwire found FOUR dynamic-index `%I` sources (not just the 2 creators):
  1. `20260502180318` + `20260502184658` reference creators → `<t>_{search,name_trgm,data,category}_idx`
  2. `20260503223414` → `<t>_is_placeholder_idx` (ALSO adds dynamic COLUMN `is_placeholder`)
  3. `20260511104727` → 19 tables (incl reference_relationships) × `<t>_description_source…` (name suffix
     unconfirmed — read line 22-24; ALSO adds dynamic COLUMN `description_source`)
     Finish indexes by adding these to the generator (index:: keys) + a columns:: note for #2/#3.
     The category code (regexes+prodSelect) is commented in check-db-schema-present.mjs, ready to re-enable.

## REMAINING now: indexes (4 sidecars), triggers, policies (case-preserving!), functions (signature),

## columns (table-body parse + dynamic ref cols), then manual-review bucket, allowlist seed

## (tickets/ticket_events), smoke test, BESPOKE reg, ADR-0036, retire check-db-objects-present, CI wiring, judge-arch, PR.

## Test: `$env:DB_SCHEMA_EXTRACT_ONLY="1"; node scripts/ci/check-db-schema-present.mjs` (+ `DB_SCHEMA_PROBE=a,b`)

# Session 3 — adversarial correctness audit + 9 fixes (commit e213b81)

Prod reconciliation reached the final 5 gate findings; classification (verified, not guessed):

- `interview_invites_application_id_fkey` — GATE BUG (phantom): the FK is added only inside an
  `IF EXISTS(...)` DO-guard and NO migration CREATEs `interview_invites` (a Lovable-era table absent
  from prod). Fixed earlier (commit 0630de2) by the cross-category filter (constraint asserted only on
  a migration-created table). Confirmed absent in prod via `to_regclass`.
- `support_ticket_pointers_customer_user_id_fkey` + `class_module_attachments_item_position_key` —
  NOT drift: both constraints VERIFIED PRESENT in prod (truth-table `to_regclass`+`pg_constraint`).
- `framework_overview_mv` + `framework_overview_v` — **STILL OPEN, user decision pending**: genuine
  drift (created 20260502192050/192120, never dropped by any migration, absent from prod) but ZERO
  runtime code usage (only in generated types.ts; likely superseded by `framework_entity_v`).
  Recommended RETIRE via `DROP … IF EXISTS` migration (no-op in prod, repo matches reality, gate nets
  them out) vs recreate. Not yet actioned.

Then an **adversarial correctness audit** (Workflow run wf_1c3380d6-cf0: 8 lenses → adversarial
verify vs the 711-migration corpus → completeness critic) found the gate was NOT yet "structurally
impossible to fail". **9 confirmed defects FIXED in commit e213b81** (all verified; smoke tests added):

FAIL-OPEN (a green gate while drift exists):

1. Test seams (fixture/dump/extract/root/probe) short-circuited to exit 0 with no prod check → now
   FAIL CLOSED in CI unless `DB_SCHEMA_ALLOW_SEAMS=1` (smoke test sets it; blocking gate never does).
2. Allowlist was fail-OPEN (subtract-before-diff, no proof-of-absence) → now fails closed if an
   allowlisted object is PRESENT in prod, and rejects a waiver key naming an inactive category.
3. Empty `%I` sidecar array satisfied the tripwire while injecting nothing → now fails closed.
4. Loose floors (~25% below actual) → pinned `BASELINES` (table 202, extension 7, type 25, view 19,
   constraint 19, rls_enabled 202) ±2, real-corpus-only (skipped for DB_SCHEMA_ROOT); + always-on
   zero-derived tripwire. **BUMP `BASELINES` in the same PR whenever a migration changes the schema.**

CORRECTNESS / HONESTY: 5. Tokenizer: backslash escapes a quote only in `E'...'` (standard_conforming_strings ON) — a plain
`'…\'` no longer over-consumes and mask following DDL (`_sql-scan.mjs`). 6. `rls_enabled` restricted to `public` schema (drops the `realtime.messages` system-table phantom). 7. Comma-list `DROP TABLE/VIEW/TYPE a, b` now subtracts every target (was: only the first).
8/9. Header docstring + run output no longer overclaim; they name ACTIVE categories and state cron +
the 5 unimplemented categories are NOT verified.

Tests: `src/test/smoke/check-db-schema-present.smoke.test.ts` (12 scenarios, every fail-closed path)

- `src/test/smoke/sql-scan.smoke.test.ts` (7). Gate registered in check-ci-guard-integrity
  BESPOKE_DIR_READERS. Green: check-guard-has-test (44/44), check-ci-guard-integrity, arch-gate.

STILL REMAINING (unchanged from session 2 + new): the 2 framework views decision (user); functions /
columns / indexes / triggers / policies categories; manual-review bucket; ADR-0036 doc; retire
check-db-objects-present; CI wiring (advisory→blocking); prod re-run to confirm 0 findings (needs the
`sbp_` token); then judge-arch on the whole gate + PR. Full audit output:
`~/…/7920c951-…/tasks/wrfrgmxtu.output` (28 findings; 9 confirmed) + wf_1c3380d6-cf0 journal.
