# ADR-0036 comprehensive schema-reconciliation gate — WIP resume notes

Work-in-progress. Committed to a WIP branch to preserve it; NOT merged. Resume from here.

## Goal (user-chosen: "Comprehensive gate"; "make it automatic"; "structurally impossible to fail")

Replace the tables+functions-only gate (`check-db-objects-present.mjs`, ADR-0035) with a
**comprehensive** gate that verifies EVERY schema object a committed migration declares actually
EXISTS in prod — across ~19 categories — because prod has **no `supabase_migrations` ledger**
(post-Lovable cutover). Verify reality, not a claim. Fail closed. Then wire it to run
**automatically** (scheduled + on migration PRs; advisory → blocking after reconcile).

The `SUPABASE_ACCESS_TOKEN` repo secret is ALREADY SET (confirmed by user), so the automatic CI
path can activate immediately once wired. The user runs a valid `sbp_` Management PAT locally too.

## Honest boundary (do not fake): unverifiable effects

Data backfills (~1269 INSERT/UPDATE), DROP-only migrations, in-place ALTERs (column type/NOT NULL/
default, function body, policy rule, cron schedule), GRANT/REVOKE state, COMMENTs, etc. have NO
structural presence signature. The gate must NOT equate "can't check" with PASS — it lists them in
a **manual-review bucket** and fails closed until each is acknowledged in a reviewed allowlist.

## Design source (durable)

- 26-agent design workflow output — per-category extraction regexes, prod introspection SQL,
  normalization, false-positive filters, and adversarial verifier FIXES.
  - Extracted specs (this dir): `adr-0036-schema-gate-design.json`.
  - Raw workflow journal (persists in home, survives temp cleanup):
    `C:\Users\morga\.claude\projects\C--Users-morga-Documents\7920c951-e3ef-4d82-bf37-d04a8e30f7e5\subagents\workflows\wf_fc7d2ab6-5d0\journal.jsonl`
  - Re-run/resume the workflow: `Workflow({scriptPath: "C:\\Users\\morga\\.claude\\projects\\C--Users-morga-Documents\\7920c951-e3ef-4d82-bf37-d04a8e30f7e5\\workflows\\scripts\\comprehensive-schema-reconciliation-design-wf_fc7d2ab6-5d0.js", resumeFromRunId: "wf_fc7d2ab6-5d0"})`

## DONE + PROVEN (this branch)

- `scripts/ci/_sql-scan.mjs` — shared single-pass SQL tokenizer (`codeView`, `unterminatedDollarTag`).
  Masks comments/strings/dollar-bodies (equal-length, offsets preserved), keeps DO-block bodies.
  Tested: 15/15 (incl. real BDD migration — Gherkin prose masked, real CREATE TABLEs survive).
- `scripts/ci/check-db-schema-present.mjs` — harness + **tables** category only, so far.
  - Fail-closed harness (EXIT sentinel), loadMigrations (unterminated-dollar tripwire, ^\d{14}_ order check),
    generic `deriveNet` (created−dropped−renamed, statement order, sidecar-name injection),
    per-category floor, allowlist, extract-only mode (`DB_SCHEMA_EXTRACT_ONLY=1` + `DB_SCHEMA_PROBE=a,b`).
  - **tables PROVEN** (extract-only): 204 tables (= design's expected). Probes: profiles/notifications/
    announcements PRESENT (the #339 drop-bug is FIXED — anchored DROP TABLE ignores `ALTER PUBLICATION
... DROP TABLE`), reference_team_functions absent + reference_job_functions present (rename via stream),
    reference_roles/passkey_credentials absent (drop).
- `scripts/ci/db-dynamic-objects.json` — reviewed sidecar of `%I` fan-out names (14 + 5 reference_*).
  Keyed `kind::filename`; names are AS-CREATED (stream applies later rename/drop).

## CRITICAL FINDING (already actionable)

The **shipped** `check-db-objects-present.mjs` (#339, merged) has an **un-anchored `DROP TABLE`
regex** that matches `ALTER PUBLICATION supabase_realtime DROP TABLE public.<t>` (10 statements:
profiles, notifications, announcements, project_applications, …) and wrongly subtracts those LIVE
tables from the must-exist set → it can **hide** the drift it exists to catch. The new gate fixes
it (anchored `/(?:^|;)\s*drop\s+table/`). Decide in ADR-0036: supersede #339's gate, or hot-fix its
regex in the interim.

## REMAINING (in order)

1. **Add the 11 remaining core categories** to `CATEGORIES[]` in check-db-schema-present.mjs, each
   from `adr-0036-schema-gate-design.json` WITH the verifier `fixes` applied. Extract-test each
   against all 711 migrations (`DB_SCHEMA_EXTRACT_ONLY=1`, probe key names). Expected declared counts
   (design): functions ~409, columns ~1900, policies ~458, triggers ~150, indexes ~300, types ~27,
   constraints ~22, rls_enabled ~213 (NOT 196 — delete the DROP-subtraction; spec "broken" fix),
   cron_jobs ~48, views ~19-distinct, extensions ~7.
   - Category-specific notes: `rls_enabled` spec was **broken** → DELETE drop-subtraction (fix listed),
     assert public.profiles in set. `functions` → name+identity-args signature, normalizeSignature on
     BOTH sides, strip leading extensions./public. on type tokens, SET search_path=public,extensions.
     `columns` → constraint-skip keyword list must be CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE
     (REMOVE `key`,`references`) so feature_flags.key etc. are captured. `cron_jobs` → count-parity
     tripwire (count `cron.schedule(` == captured names) + verbatim case-sensitive compare.
     `constraints`/`views`/`triggers`/`indexes`/`policies` → mask strings+dollar via the tokenizer
     (already have it), add count-parity/floor tripwires, and add their **dynamic %I sidecar entries**:
     the two reference_* files ALSO fan out dynamic triggers (trg_%I_updated_at, trg_%I_search),
     indexes (_search_idx etc.), and policies — add `trigger::`/`index::`/`policy::`/`rls_enabled::`
     keys to db-dynamic-objects.json (enumerate real names = per-reference-table suffixes).
2. **Compose prod query + fetch + diff.** UNION ALL each `category.prodSelect`. Fetch via Supabase
   Management API (reuse #339 pattern EXACTLY: exitCode+throw EXIT, NO process.exit after fetch to
   avoid the Windows libuv assert; fail closed on !token/!ref/!res.ok/non-array). Diff per kind:
   declared − prod − allowlist = missing → fail exit 1. Seam: `DB_SCHEMA_PROD_FIXTURE` (JSON array of
   {kind, identifier}). SUPABASE_PROJECT_REF=pzvqxdgoztbfikfuifix.
3. **Manual-review bucket** — detect migrations whose only effects are unverifiable (see the workflow
   critic's 11 `unverifiableEffects`); require ack in allowlist; fail closed if non-empty & unacked.
4. **Seed `scripts/ci/db-schema-allowlist.json`** with confirmed false positives: `{"table":
["tickets","ticket_events"]}` (superseded by support_ticket_events; 0 code refs). "public" phantom
   already excluded by RESERVED — verify. (Also carry over any db-objects-allowlist.json entries.)
5. **Smoke test** `src/test/smoke/check-db-schema-present.smoke.test.ts` (extraction + diff via
   DB_SCHEMA_ROOT/DB_SCHEMA_PROD_FIXTURE seams; assert present→0, absent→1, allowlisted→0,
   no-token→2, dynamic-unregistered→2, unterminated-dollar→2). Register `check-db-schema-present.mjs`
   in `check-ci-guard-integrity.mjs` BESPOKE_DIR_READERS (uses readdirSync). `_sql-scan.mjs` is an
   underscore harness module → excluded from guard scans by construction (like `_json.mjs`), no test.
6. **Retire** `check-db-objects-present.mjs` + its smoke test + `db-objects-allowlist.json` (superseded)
   — OR keep+hotfix its drop regex interim. Update ci.yml, guards-wired-allowlist, BESPOKE list.
7. **ADR-0036** (supersedes ADR-0035) + decisions.md §6 update.
8. **Wire automatic**: a scheduled workflow (daily) + on migration PRs, advisory→blocking; keep on
   guards-wired-allowlist while deferred/advisory.
9. **judge-arch → PR → merge on green** (user standing auth: "merge when it passes CI"; gh = mdenner1234).

## THEN: reconcile the backlog (needs user's token; dashboard SQL editor)

The current object gate already found 10 missing objects; 5 are GENUINE unapplied migrations to
apply IN ORDER (feature_flags already applied): 20260809120000_harden_role_confirmation_tokens,
20260809140000_translation_rate_limit, 20260809170000_edge_rate_limit,
20260810130000_gdpr_erasure_email_gumroad_pii, 20260816120000_events_refresh_decouple_and_watchdog.
2 are false positives to allowlist: tickets, ticket_events. The comprehensive gate will likely find
MORE (columns/policies/etc. from the same unapplied window) — that's the point.

## Test commands (from the repo root of a clone with these files)

- Tokenizer test: `node <scratchpad>/test-sql-scan.mjs` (or port into the smoke test).
- Extraction self-check: `$env:DB_SCHEMA_EXTRACT_ONLY="1"; $env:DB_SCHEMA_PROBE="profiles,tickets"; node scripts/ci/check-db-schema-present.mjs`
- Standing constraints: PowerShell (Bash fork-broken); BOM-free writes ([IO.File]::WriteAllText);
  NEVER commit deno.lock; `git commit -F <file>`; prod ops via Supabase Dashboard SQL Editor.
