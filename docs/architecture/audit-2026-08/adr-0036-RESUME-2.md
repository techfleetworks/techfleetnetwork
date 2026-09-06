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

## Test: `$env:DB_SCHEMA_EXTRACT_ONLY="1"; node scripts/ci/check-db-schema-present.mjs` (+ `DB_SCHEMA_PROBE=a,b`)
