# ADR 0036 — Reconcile the WHOLE declared schema against prod, not just tables + functions (supersedes ADR-0035)

- Status: Accepted
- Date: 2026-09-11
- Deciders: TechFleet (owner)
- Supersedes: [ADR-0035](0035-db-objects-present-verification.md) (object-existence verification for tables + functions only)
- Related: `scripts/ci/check-db-schema-present.mjs`, `scripts/ci/db-schema-allowlist.json`, `scripts/ci/db-dynamic-objects.json` (+ its generator `gen-db-dynamic-objects.mjs`), `scripts/ci/_sql-scan.mjs` (shared tokenizer), `src/test/smoke/check-db-schema-present.smoke.test.ts` + `src/test/smoke/sql-scan.smoke.test.ts`, the `db-schema-gate` job in `.github/workflows/ci.yml`, `config-preflight.yml` (daily out-of-band drift sweep), ADR-0019 (arch gate), ADR-0022/0023/0029 (a guard must be tested, discriminate, be wired), ADR-0026 (expand/contract). The Discord-linking PGRST202 outage (migration `20260809161000` committed but never applied) and the `feature_flags` incident that motivated ADR-0035.

## Context and problem statement

ADR-0035 replaced ledger-based verification (ADR-0020, which asked a `supabase_migrations.schema_migrations` table that **does not exist** on TFN's post-Lovable prod) with reality-based verification: derive the objects the committed migrations DECLARE, then assert each EXISTS in prod over the Management API (HTTPS). That was the right shape — check the territory, not the map — and it fails closed.

But ADR-0035 verified only **two** object kinds: **tables and functions**. A migration declares far more than that, and every un-checked kind is a hole the exact outage class can slip through:

```
-- all of these can be committed and never applied, and ADR-0035 sees NONE of them:
ALTER TABLE public.orders ADD COLUMN status text;          -- column
CREATE INDEX orders_status_idx ON public.orders (status);  -- index
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders …; -- trigger
CREATE POLICY "members read own" ON public.orders …;       -- policy
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;       -- rls
ALTER TABLE public.orders ADD CONSTRAINT … CHECK (…);      -- constraint
```

A column that a query selects, an RLS policy that gates a read, a `NOT NULL`/`CHECK` the app relies on — any of these, committed but never `db push`ed, produces a live `42703 column does not exist` / `42P01` / silent authorization gap in front of real traffic, and ADR-0035's gate stays green. The narrow gate closed the "table/function never applied" hole; it left "**anything else** never applied" wide open.

We had proof this matters the moment we widened the derive: reconciling the real corpus surfaced ten genuine committed-but-unapplied objects across four migrations (a partially-applied `fleety_rearchitecture`, a diverged `stats_drift_log` CREATE, a `CREATE TABLE IF NOT EXISTS` that silently no-op'd a `request_idempotency` redefinition, and an unapplied `project_roster` SELECT policy) — none visible to the tables+functions gate.

## Decision drivers

- **Close the whole hole, not two edges of it.** If a migration can DECLARE it and prod can LACK it, the gate must reconcile it. Anything less is a gate that verifies "some" of the schema and calls it "the schema."
- **Fail closed, never skip-green** (unchanged from ADR-0035). No token, unreachable API, bad response, zero objects derived, a per-category count off its pinned baseline, an unterminated dollar-quote, an unregistered `%I` fan-out → red, never green.
- **No false negatives from cleverness.** Where the derive can't be exact (dynamic `%I` fan-outs, multi-statement `ALTER`, cross-category phantoms), the failure mode must be a loud false-positive we can allowlist — never a silent miss that hides real drift.
- **HTTPS-only, activate-later** (unchanged). Mergeable before the prod secret and prod reconciliation exist; no direct Postgres.
- **Structurally impossible to break.** The end state is a BLOCKING CI gate that a migration declaring an absent object cannot pass — plus the guard-integrity ratchets (tested, discriminating, wired) so the gate itself can't rot to a false green.

## Considered options

1. **Keep ADR-0035 (tables + functions only).** Least work; leaves every other object kind unverified.
2. **Add the remaining statically-reconcilable categories to one gate (chosen).** Extend the derive to 11 categories — table, extension, type, view, constraint, rls_enabled, function, index, trigger, policy, column — each with a prod query keyed on the same identity, sharing one fail-closed diff.
3. **A pgTAP / shape-diff tool against a live connection.** Richer (checks column types, not just presence), but couples the invariant to the fragile direct-Postgres path ADR-0035 rejected, and can't run from any clone over HTTPS.
4. **A full `pg_dump` schema diff.** Requires superuser/direct connection and reconciling every Supabase-managed object; enormous noise, same connection problem.

## Decision outcome

**Chosen: Option 2 — one gate, all 11 statically-reconcilable categories.** `scripts/ci/check-db-schema-present.mjs` derives each category from the committed migrations and asserts every declared object exists in prod, over the Management API. Salient design points, each earned from a concrete failure:

- **Category identity is chosen so declared == prod is an exact string match.** Functions are identified by `public.name(IN-arg TYPES)` via `format_type(proargtypes)` — NOT `pg_get_function_identity_arguments`, which on this Postgres emits argument _names_ and produced 238 phantom mismatches. Indexes are `table.index` (not the bare name) so a dropped-table index can be filtered. Policies are `public.table :: Name` with the policy name **case-preserved**. Columns are `public.table.column`.
- **Cross-category integrity runs at DIFF time, keyed on PROD's tables (step 5a).** A table-scoped object (constraint/index/trigger/policy/column) whose table is ABSENT from prod is dropped from the diff — its missing table is already flagged by the table category, and this removes the `interview_invites`-style phantom (an object added only inside an `IF EXISTS` DO-guard on a Lovable-era table). Keying on prod's tables, not the _derived_ tables, is deliberate: keying on derived tables would silently drop an object on a prod table the migrations didn't create — a false negative invisible under a declared-⊆-prod diff.
- **Multi-statement `ALTER` is fully scanned.** `ALTER TABLE t ADD COLUMN a, ADD COLUMN b` names the table once; the continuation clauses carry no `ALTER TABLE` prefix. An earlier per-statement regex captured only the first clause, silently under-deriving every 2nd+ column — a false negative that would let a never-applied multi-`ADD` column pass green. The derive now matches each `ALTER` statement to its terminator and scans every `ADD`/`DROP COLUMN` clause. (Pinned by smoke DSP-013.)
- **Per-category paged prod fetch.** A single UNION-ALL of all categories, or an unpaged `column` category (~2000 rows), exceeds the Management-API response cap (~960 rows) and silently truncates — making present objects look MISSING and, worse, potentially hiding a real one. Each category is fetched in its own request, ordered by its (unique) identity and paged with LIMIT/OFFSET; fail-closed if any single category nears the cap.
- **Dynamic `%I` fan-outs → a reviewed, generated sidecar.** `EXECUTE format('… %I …')` loops (the `reference_*` table factories, audit/UGC trigger fan-outs) can't be read statically. A tripwire flags any file that fans out via `%I` and FAILS CLOSED unless that file has a reviewed entry in `db-dynamic-objects.json` (produced by `gen-db-dynamic-objects.mjs`). An empty entry for a flagged file is itself a failure.
- **`cron` is deferred, explicitly.** Cron jobs are (re)scheduled through loop variables (`cron.schedule(r.jobname, …)`), so a literal-only derive over-declares and netting removals causes false negatives — not statically reconcilable. Every green run prints a coverage note naming cron as the one unverified category, so a pass is never mistaken for "the whole schema is reconciled."
- **Fail closed everywhere**, plus a per-category **BASELINES ±2** count tripwire: a derived count that drops below its pinned baseline is a partial-capture regression (silent under-verification) and fails; a rise is unreviewed schema growth and fails until the baseline is bumped in the same PR. An active category with no baseline fails closed.

### The drift allowlist is a shrink-only ratchet, not an escape hatch

`db-schema-allowlist.json` waives objects a migration DECLARES that are legitimately absent from prod. It is fail-closed in both directions: an allowlisted object that turns out to be **present** in prod fails the gate (a stale waiver must not mask a real object), and a key naming an inactive category fails. Two kinds of entry, both documented inline with a reason: (1) intentional design drift (superseded/renamed/dropped out of band); (2) **known pre-existing prod drift pending reconciliation** — the ten objects the widened derive surfaced. Each (2) entry names its declaring migration, root cause, and remediation, and self-heals: once the fix is applied in prod the object appears, the stale-waiver tripwire fires, and the entry MUST be removed. The list may only shrink.

### Rollout — blocking now (past ADR-0035's deferral)

ADR-0035 shipped deferred (on `guards-wired-allowlist.json`, in no CI job) because the token secret and prod reconciliation weren't in place. This gate ships **blocking**: a `db-schema-gate` job in `ci.yml`, a required member of the `gate` aggregator, runs whenever migrations or the gate's own inputs change (skipped-as-pass otherwise, like `migration-smoke`). The pre-existing drift is reconciled by the ratchet above rather than by deferring the whole gate, so NEW drift is blocked from day one while the known backlog burns down. Out-of-band prod drift (an object dropped in prod with no migration) is swept daily by `config-preflight.yml`. The gate needs `SUPABASE_ACCESS_TOKEN` set as a repo secret; with it unset the job fails closed (red), which is correct — a gate that cannot verify must not pass.

## Consequences

**Good**

- The "anything but a table/function, never applied" hole is closed: eleven categories are reconciled against prod reality, with cron the one explicitly-deferred, always-annotated exception.
- Every widening is fail-safe. The derive skews toward over-declaring (multi-clause ALTER fully scanned, `%I` fan-outs required to register, phantoms filtered only when their table is truly absent); the failure mode is a loud, allowlistable false-positive, never a silent false negative.
- The gate is now BLOCKING and cannot itself rot: `check-guard-has-test` + `verify-guard-test-discrimination` (tested and non-vacuous), `check-guards-wired` (referenced in a live CI step), `check-ci-guard-integrity` (bespoke-reader contract), and membership in the required `gate` make "silently stops protecting" impossible by construction.
- Ten real committed-but-unapplied objects were found and documented the first time the widened gate ran — value delivered before the gate even merged.

**Bad / accepted**

- **Presence, not shape** (inherited from ADR-0035). The gate confirms an object exists, not that a column's type or a constraint's predicate matches the migration. A column present but of the wrong type is `migration-smoke`'s / expand-contract's (ADR-0026) domain. This gate closes "never applied at all," the class that caused outages.
- **The `%I` sidecar is hand-reviewed.** A new `reference_*`-style fan-out must be added to the generator or the gate fails closed on it. Accepted: fail-closed is the safe direction, and the tripwire makes forgetting impossible rather than silent.
- **BASELINES must be bumped with schema changes.** A migration that legitimately adds objects moves a category's count and must bump its baseline in the same PR. Accepted: a one-line reviewed change is the cost of catching partial-capture regressions.
- **Blocking couples migration PRs to prod availability + the token secret.** A migration-touching PR cannot merge while the Management API is unreachable or the secret is unset. Accepted: that is the fail-closed contract; non-migration PRs are unaffected (skipped-as-pass), and the daily sweep covers out-of-band drift.

## Confirmation

- `src/test/smoke/check-db-schema-present.smoke.test.ts` runs the real guard against throwaway migration dirs + a prod-objects fixture (via `DB_SCHEMA_ROOT` / `DB_SCHEMA_PROD_FIXTURE`) and pins present→0, absent→1, allowlisted→0, allowlisted-but-present→2, dead allowlist key→2, empty `%I` sidecar→2, zero-derived→2, a leaked test seam in CI→2, comma-list `DROP TABLE` subtracts both, `rls_enabled` is public-only, and (DSP-013) a multi-clause `ALTER … ADD COLUMN a, ADD COLUMN b` derives BOTH columns. `src/test/smoke/sql-scan.smoke.test.ts` pins the shared tokenizer.
- `check-guards-wired` credits the guard (referenced in the `db-schema-gate` step); `check-guard-has-test` + `verify-guard-test-discrimination` prove the test exists and is non-vacuous; `check-ci-guard-integrity` lists it in `BESPOKE_DIR_READERS`.
- ADR-0035's `check-db-objects-present.mjs`, its smoke test, `db-objects-allowlist.json`, its `guards-wired-allowlist.json` entry, and its `BESPOKE_DIR_READERS` line are deleted in this change; ADR-0035 is marked superseded with the reason inline.
