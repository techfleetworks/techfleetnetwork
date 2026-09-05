# ADR 0034 — Verify DB objects EXIST in prod, not that a ledger records them (supersedes ADR-0020)

- Status: Accepted
- Date: 2026-09-05
- Deciders: TechFleet (owner)
- Supersedes: [ADR-0020](0020-migrations-applied-verification.md) (migration-applied verification via the `schema_migrations` ledger)
- Related: `scripts/ci/check-db-objects-present.mjs`, `scripts/ci/db-objects-allowlist.json`, `src/test/smoke/check-db-objects-present.smoke.test.ts`, `migration-smoke` + `check-migration-version-collision.mjs` (sibling migration guards), ADR-0026 (expand/contract — why a migration can be live while old code runs), ADR-0022/0023/0029 (a guard must be tested, discriminate, and be wired), decisions.md §6 (the companion no-BOM hygiene guard added in the same change). The `feature_flags` incident (migration `20260827120000` committed but never applied to prod).

## Context and problem statement

ADR-0020 added a gate to answer "is every committed migration actually live on prod?" — the right question, born from the Discord-linking PGRST202 outage. Its implementation asked prod for its **applied-migration ledger**: `select version from supabase_migrations.schema_migrations`, via the Supabase Management-API SQL endpoint.

**That table does not exist in TFN's production database.** TechFleet migrated off Lovable onto native Supabase, and the cutover never bootstrapped `supabase_migrations.schema_migrations` — the ledger the Supabase CLI would normally maintain was never created. So the guard's query returned `relation "supabase_migrations.schema_migrations" does not exist`. ADR-0020's script (correctly, for a _genuine_ API outage) routes any failure to obtain rows through `unreachable()` → `::warning::` → **exit 0**. The net effect: a gate that **could never go red**. It looked green on every run while verifying nothing — the precise "a guard that verifies nothing" false-green the gate-integrity effort (ADR-0022/0023/0024/0029) exists to eliminate, hiding inside the one guard whose job was to catch drift.

This is not hypothetical. Migration `20260827120000_feature_flags` was committed, passed `migration-smoke` (it applies fine to a fresh local Postgres), merged — and was **never applied to prod**. Nothing caught it. It surfaced only when a feature-flag ramp queried `public.feature_flags` and got `42P01 relation does not exist` against the live database, in front of real traffic.

The root defect is deeper than a wrong table name: **verifying against a ledger is verifying against a claim.** A ledger can be missing (our case), stale, hand-edited, or forged. Whether a migration is "recorded as applied" is a different fact from whether its effects are actually present. We were checking the map, not the territory.

## Decision drivers

- **Fail closed, never skip-green.** A verification gate that cannot verify must go red, not quietly pass. This is the single lesson of the incident.
- **No dependency on a ledger we don't own and don't maintain.** The `schema_migrations` table is CLI-managed; our post-Lovable prod doesn't have it, and back-filling it would be inventing state to satisfy a check.
- **HTTPS-only, no direct Postgres.** The direct DB connection / `supabase` CLI is unreliable on operator machines (PgClient connect failures, broken `.supabase/profile`). The gate must run from any clone over plain HTTPS.
- **Check reality, not a proxy for it.** Assert the thing that actually matters — the object is present — so no amount of ledger drift can produce a false green.
- **Safe to ship before the prod secret exists.** We cannot flip prod state or set repo secrets from a dev session; the gate must be mergeable now and _activate_ later without a code change.

## Considered options

1. **Bootstrap the ledger, keep the ADR-0020 gate.** Back-fill `supabase_migrations.schema_migrations` with every existing version, then let the ledger gate run.
2. **Verify object existence directly (chosen).** Derive the set of tables/functions the committed migrations DECLARE, and assert each one EXISTS in prod via a `pg_tables` / `pg_proc` query over the Management API. No ledger.
3. **Fix the direct Postgres connection and use `supabase migration list`.** Repair the CLI/DB path on the operator machine and diff repo vs. `migration list`.
4. **Drop automated verification; rely on a manual "did you `db push`?" checklist.**

## Decision outcome

**Chosen: Option 2 — object-existence verification.** `scripts/ci/check-db-objects-present.mjs`:

- Parses `supabase/migrations/*.sql` and derives the declared object set = (tables + functions **created**) − (those later **dropped**), with commented-out SQL stripped first. Objects the regex derivation legitimately over-declares (renamed away, replaced by a view, dropped out of band) live in a reviewed, shrink-only `db-objects-allowlist.json`.
- Queries prod for what actually exists: `select 'table', tablename from pg_tables where schemaname='public' union all select 'function', p.proname from pg_proc … where nspname='public'`, via `POST https://api.supabase.com/v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN`. HTTPS only; read-only; never writes.
- Reports every declared-but-**absent** object as drift (exit 1) — a migration committed but never applied, the outage class.
- **Fails closed (exit 2)** on: no access token, no project ref, an unreachable/erroring API, an unexpected response shape, or unreadable migrations. A gate that cannot check is red, not green. This is the exact inversion of ADR-0020's skip-green.

**Why not the others:**

- **Option 1 (bootstrap the ledger)** treats the symptom. It re-creates the very indirection that failed — we'd be hand-writing "applied" claims and then trusting them. The ledger could drift from reality again the next time someone applies SQL out of band, and the gate would again verify a claim, not the schema. Inventing state to satisfy a check is how the check stops meaning anything.
- **Option 3 (fix the CLI/Postgres path)** couples a CI invariant to a fragile, machine-specific direct-DB connection that has repeatedly failed on operator hardware. `migration list` is also itself ledger-based — same class of problem as Option 1. The Management API over HTTPS is the connection that actually works everywhere.
- **Option 4 (manual checklist)** is what we had before ADR-0020, and it produced the PGRST202 outage. Humans forget `db push`; that is the whole reason this gate exists.

### Rollout — deferred, then blocking (the ADR-0019 "observe then block" shape, adapted)

The gate ships **deferred**: listed on the shrink-only `guards-wired-allowlist.json`, so `check-guards-wired` accepts it as a known not-yet-wired guard, and it is **not** in any CI job yet. It is fully committed, tested, and runnable by hand today. It is **not** wired as blocking now because two prerequisites are outside a dev session's control:

1. `SUPABASE_ACCESS_TOKEN` must be set as a repo secret (a gate that fails-closed with no token would paint CI red on every run until then — deferral avoids that persistent-red noise while preserving fail-closed semantics when it _does_ run).
2. The current real drift must be reconciled: the operator runs the guard from a clone with a real token, applies the genuinely-missing migrations (starting with `feature_flags`) to prod, and allowlists any true false-positives (an object intentionally renamed/dropped out of band) with a reason.

Once both hold, the guard moves off the allowlist into the blocking `lint-arch-critical` matrix — the same end state ADR-0020 aimed for, now on a foundation that cannot silently pass. That promotion is a one-line allowlist deletion + one matrix line; no logic change.

## Consequences

**Good**

- The false-green is structurally gone: with no token the gate is **red (exit 2)**, not green; with a token, a missing object is **red (exit 1)**. There is no path where it passes without actually confirming prod.
- No dependency on a ledger we don't maintain. Works over HTTPS from any clone, no direct Postgres, no CLI.
- Catches the real failure (`feature_flags` absent) that ADR-0020 structurally could not.
- The derive-and-diff logic is exercised in CI without a live project via the `DB_OBJECTS_PROD_FIXTURE` seam; the smoke test pins present→0, absent→1, allowlisted→0, and fail-closed→2, and it discriminates under the mutation gate.

**Bad / accepted**

- **Regex derivation is approximate.** It models `CREATE`/`DROP` of tables and functions with forgiving patterns; it does not model views, types, triggers, policies, renames, or generated names, and a function overloaded by signature collapses to its name. Accepted: the allowlist absorbs over-declaration, and the failure mode is a _false positive_ (a loud, fixable "declared X is missing") — never a false negative that hides real drift. The set skews toward over-declaring, which fails safe.
- **Presence, not shape.** The gate confirms an object exists, not that its columns/signature match the migration. A table that exists but is missing a later-added column is not caught here — that is `migration-smoke`'s and expand/contract's domain (ADR-0026). This gate closes the "never applied at all" hole, which is the one that caused outages.
- **Requires a repo secret to activate.** Until `SUPABASE_ACCESS_TOKEN` is set, the gate is deferred and not blocking. Documented above; the deferral is on the shrink-only allowlist so it stays visible.
- **A dropped-and-recreated-under-a-different-name object needs an allowlist entry.** Accepted cost of a reviewed, shrinking list.

## Confirmation

- `src/test/smoke/check-db-objects-present.smoke.test.ts` runs the real guard against throwaway migration dirs + a prod-objects fixture (via `DB_OBJECTS_ROOT` / `DB_OBJECTS_PROD_FIXTURE`) and asserts: declared+present → 0, declared+absent → 1, allowlisted → 0, a declared function absent → 1, no-token → 2, missing-migrations-dir → 2.
- `check-guard-has-test` credits the guard (its test execs the guard's resolved path); `verify-guard-test-discrimination` proves that test is non-vacuous (stub the guard → the test fails).
- `check-ci-guard-integrity` lists the guard in `BESPOKE_DIR_READERS` (it reads migration filenames via `readdirSync` + queries an API — not a recursive content scan) and confirms it does not swallow an error into `exit(0)` or use `new URL().pathname`.
- The retired `check-migrations-applied.mjs`, its smoke test, and `migration-applied.yml` are deleted in this change; ADR-0020 is marked superseded with the reason inline.

## Companion change — the no-BOM hygiene guard (decisions.md §6)

Reconciling the `feature_flags` gap on Windows repeatedly tripped a second, orthogonal failure: PowerShell's `Set-Content -Encoding utf8` and `>` prepend a UTF-8 BOM (bytes `EF BB BF`), and a BOM at the start of a JSON file makes `JSON.parse` throw — so a budget/allowlist file that silently acquired one _crashed the very guards that read it_. `scripts/ci/check-no-bom.mjs` (blocking, in the gate job) forbids a leading BOM in any tracked text file — the structural defense, so a BOM can't be committed — and the guard-integrity checks that read the hand-edited ratchet/allowlist JSON (`check-guards-wired`, `check-guard-has-test`, `check-db-objects-present`) go through a shared BOM-tolerant reader (`scripts/ci/_json.mjs`) as a second layer for a file BOM'd locally before CI sees it. This is recorded as a rule with a negative example in **decisions.md §6** rather than as its own ADR: it is a hygiene invariant, not an architectural decision with competing options. It ships in this change because it is part of making these guards "structurally impossible to break."
