# ADR 20261110 — Widen the expand/contract migration guard to the full unsafe-DDL rule set

- Status: accepted
- Date: 2026-11-10
- Deciders: repo owner (mdenner), in session
- Relates to: ADR-0026 (migrations are forward-only, apply in parallel with the deploy), decisions.md §7,
  enterprise-readiness re-audit 2026-10-30 (REL-4 / DB-3)

## Context

`scripts/ci/check-migration-expand-contract.mjs` (EXPAND-CONTRACT-001) enforces the expand/contract rule:
because a `supabase db push` is not atomic with the frontend/edge deploy, a migration can be live on prod
while the old code is still running, so a destructive or lock-taking schema change breaks the running old
code — or stalls live traffic behind a lock — the instant it applies (decisions.md §7, ADR-0026).

As shipped (#424), the guard caught only **four** in-place column changes — `DROP COLUMN`, `RENAME COLUMN`,
`ALTER COLUMN … TYPE`, `SET NOT NULL` — and it matched them **a line at a time**. The 2026-10-30 re-audit
(REL-4 / DB-3) found two gaps:

1. **The rule set was too narrow.** `release-deployment-safety`'s own gate
   (`check-migration-safety.mjs`, drawn from `references/zero-downtime-db-migrations.md`) also forbids
   `DROP TABLE`, `TRUNCATE`, `RENAME TO` (table), `ADD … NOT NULL` without a default, an `ADD CHECK`/
   `FOREIGN KEY` without `NOT VALID`, and a non-`CONCURRENTLY` `CREATE INDEX`. The re-audit added
   `DROP FUNCTION` (an RPC signature/removal change breaks old callers). None of these were caught.
2. **Line-at-a-time matching missed multi-line statements** (e.g. an `ALTER TABLE … ALTER COLUMN … TYPE`
   split across lines), and a single **file-level** annotation waved through every destructive statement in
   that file — so one reviewed contract could hide an un-reviewed one beside it.

Evidence: the gaps are `observed` — the guard source and the skill's reference implementation were read this
session, and the widened guard was run against the real tree (730 migrations).

## Decision

Widen the guard to the full expand/contract rule set, match a **statement at a time**, and require a
**per-statement** annotation.

- **Rules** (Postgres/Supabase dialect only — no MySQL `CHANGE`/`MODIFY`): `DROP TABLE`, `TRUNCATE`,
  `DROP COLUMN`, `RENAME COLUMN`/`RENAME TO`, `DROP FUNCTION`, `ADD … NOT NULL` without `DEFAULT`/`GENERATED`/
  `NOT VALID`, bare `SET NOT NULL`, `ALTER COLUMN … TYPE`, `ADD CHECK`/`FOREIGN KEY` without `NOT VALID`,
  non-`CONCURRENTLY` `CREATE INDEX`.
- **New-table exception:** an index or constraint whose target table is `CREATE`d in the **same migration**
  is safe (no running code, no data to lock) and is not flagged. This is the skill's own stated exception and
  it keeps the guard from being noise — without it, 114 historical index statements (mostly on brand-new
  tables) would flag; with it, 49 genuine (index on a pre-existing table) remain.
- **Annotation is per-statement:** `-- expand-contract-ok: <reason>` on the flagged statement (scope to one
  rule with `-- expand-contract-ok=<rule>: <reason>`). An unexplained marker (no reason) does not suppress.
- **COLUMN is optional (Postgres).** `DROP col`, `RENAME col TO`, and `ALTER col TYPE` are valid without the
  `COLUMN` keyword, so the rules match the short forms too; the DROP rule uses a negative lookahead so it
  fires on a column removal but not on the standalone object drops (own rules) or the safe sub-clauses
  (`DROP DEFAULT`/`NOT NULL`/`CONSTRAINT`).
- **New-table exception is schema-aware and string-safe.** The set of tables CREATEd in the migration is
  built from string-blanked SQL (a `CREATE TABLE` inside a string literal can't poison it) and keyed by
  schema-qualified name (unqualified defaults to `public`), so an index/FK on `public.t` is not waved
  through by a `CREATE TABLE audit.t` elsewhere in the file.
- **Grandfather, mechanically shrink-only:** the backlog snapshot grew **once** here, from 4 to **95** files
  — the honest count of pre-existing migrations that trip a now-covered rule (new-table-safe cases
  excluded). The guard **rejects any allowlist entry dated on/after the cutoff `20261110`**, so a new
  violator cannot be waved through by appending its filename — a new contract migration must annotate. It
  also prunes an entry whose file is gone or that no longer violates. The list can only shrink.
- **Fail-closed unchanged:** exit 2 on a missing migrations dir / zero migrations / unreadable allowlist.

The design bar holds: prevent by construction → fail-closed CI gate → a discrimination test that reddens
when the fix is reverted (`src/test/smoke/check-migration-expand-contract.smoke.test.ts`, EC-001..EC-040,
one case per rule plus the new-table, per-statement, scoped-waiver, short-form (optional `COLUMN`),
string-literal / cross-schema poisoning, and mechanical shrink-only behaviors — the last three added after a
fresh-context review (REL-4 follow-up) found the first cut under-flagged them).

## Alternatives considered

- **Keep the four-rule guard.** Rejected — the re-audit showed the real unsafe surface (DROP TABLE,
  non-concurrent index on a live table, FK-under-lock, DROP FUNCTION…) ships un-caught.
- **Adopt the skill's `check-migration-safety.mjs` verbatim.** Rejected — it has no grandfather and no
  env-seam fixtures, and it uses a different annotation (`-- migration-safety:ignore`). Introducing a second
  annotation convention and dropping the shrink-only backlog would churn the repo and break the existing
  annotated migrations. We kept TFN's `-- expand-contract-ok:` convention and ported the skill's
  statement-splitter + rule set into it.
- **Flag every non-concurrent index (no new-table exception).** Rejected — a 114-entry grandfather of mostly
  false positives trains the team to waive the whole gate, the exact gate-neutering failure
  `verifiable-quality-gates` exists to prevent.
- **Auto-fix historical migrations.** Rejected — migrations are forward-only and already applied on prod;
  editing them is itself unsafe. The backlog is grandfathered and burned down going forward.

## Consequences

- A destructive/lock-taking migration in any of the covered forms now cannot merge without a reviewed
  per-statement annotation; the guard is green on the current tree (730 scanned, 93 grandfathered, 0
  un-annotated — `observed`, run this session).
- New migrations carry a small annotation cost on deliberate contracts and on an index/constraint against a
  pre-existing table — intended friction that forces the "no running code uses the old shape / this lock is
  acceptable" declaration.
- **Limitation (honest):** this is a statement linter, not a SQL parser, and not a universal safety net. For
  the forms it covers it over-flags rather than under-flags (a `;` inside a `$$ … $$` body can mis-split →
  over-flag only; the inline annotation is the escape hatch). But a DDL form **outside** the rule set is not
  caught — notably `DROP VIEW` / `DROP TRIGGER` / `DROP TYPE` / `DROP PROCEDURE` (a dropped view also breaks
  running readers; scoped out here deliberately, candidates for a later widening). It assumes an unqualified
  table lives in `public` (it does not read `search_path`). It does not detect an unsafe one-shot `UPDATE`
  backfill (no row-count signal in text). It proves the schema **step** is shaped safely, not that the whole
  rollout is reversible — the rollback rehearsal and `judge-arch` review sit alongside it
  (release-deployment-safety). The earlier claim that it "never hides a real unsafe statement" was removed as
  an overclaim.
