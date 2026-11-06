# ADR 20261106 — Erasure-completeness gate driven by a schema-derived PII registry

- Status: accepted
- Date: 2026-11-06
- Deciders: engineering (enterprise-readiness remediation, Wave 1) + repo owner (erasure scope)
- Supersedes: the hand-maintained 12-table list in ADR-0039 (the guard mechanism; ADR-0039's
  reconcile migration and its reasoning stay in force)

## Context

Right-to-erasure (GDPR Art. 17, audit H9) requires that deleting an auth user leaves no personal
data behind. `public.handle_user_deletion()` (a BEFORE DELETE trigger on `auth.users`) is the
local entrypoint, and `scripts/ci/check-erasure-completeness.mjs` is the CI gate meant to keep it
complete.

The re-audit of 2026-10-30 (finding RH2 / CMP-2) showed the gate was not proving what its name
claimed. It asserted only that **12 hand-named tables** appeared in the winning
`handle_user_deletion()` body. It ran green while roughly 30 other PII-bearing tables were never
examined at all: certification mirrors holding email plus raw Airtable data
(`class_certifications`, `project_certifications`), the notification outboxes
(`notification_outbox`, `notification_dlq`), `trusted_devices` and the passkey/2FA tables, the
`discord_role_grant_queue` identity link, free-text stores (`exploration_queries`,
`fleety_turn_signals`), and more. A green gate that cannot see the real surface is the exact
"the gate cannot detect" class this remediation program exists to kill. The root cause is that the
list of what to check was hand-kept and bore no relationship to the schema, so a new PII table
could be added with no erasure path and the gate would never notice.

Scope note: Discord is the only external processor integrated today. External-processor deletion
(Discord role cleanup, Freescout, Airtable, Braintrust) is a separate, held item (re-audit RC0 /
PR-4) that needs owner-supplied secrets and staging. This decision covers **local** (Postgres)
erasure completeness only and does not assert anything about external processors.

## Decision

Derive the PII surface from the schema and reconcile it against a committed registry, rather than
trusting a hand list.

1. **Committed registry** `scripts/ci/pii-tables.json` enumerates every PII-bearing table with a
   declared `coverage`:
   - `erased` — erased or de-identified in the winning `handle_user_deletion()`.
   - `cascade` — removed by an `ON DELETE CASCADE` chain ending at `auth.users` or an erased table.
   - `orphan` — subject PII with no erasure path yet; a tracked gap, carries a `reason` that names
     the remediation (CMP-2 schema follow-up).
   - `retained` — subject PII kept under a stated legal or compliance basis (AML screening, legal
     dispute, the DSAR ledger itself, an executed DPA, an external support mirror); carries a
     `reason`.
   - `author-provenance` — the only identity column is `created_by` / `owner_id`, which records
     staff authorship of org content, not a data subject's personal data; carries a `reason`.

2. **The gate re-derives coverage from the schema and verifies the registry against it.** It strips
   SQL comments first (so a trailing `--` between a comma and the next column cannot hide an identity
   column, which was hiding `email_octopus_contact_sync`), then scans `CREATE TABLE` statements AND
   `ALTER TABLE ... ADD COLUMN` for a subject-identity uuid column (`user_id` / `*_user_id`) or an
   authorship column (`created_by` / `owner_id`); that set is the PII candidate surface. A DELETE in
   the winning body removes rows (and can root a cascade chain); an UPDATE de-identifies in place
   (the table's own PII is handled, but its rows remain, so it cannot cover a child by cascade); an
   INSERT (for example into `audit_log`) is neither and never counts as erasure. It computes
   which candidates are covered. A cascade counts as COMPLETE (auto-covered) only when it is safe:
   either (a) a subject-identity column (`user_id` / `*_user_id`) cascades to `auth.users` or an
   erased table, so the cascade follows the subject itself; or (b) the table has no independent
   subject column (authorship-only) and a NOT NULL cascade FK to a covered parent, so every row goes
   and no separate subject column can point at a different, non-cascaded user. A table that has a
   subject column but is cascaded only through a non-identity FK (for example `class_audit.actor_user_id`,
   removed only via `class_id` to the class owner) is deliberately NOT auto-covered — the actor's
   rows on someone else's parent would orphan — so it must be an explicit `cascade` entry with a
   reason affirming the parent is the same subject, or be classified as a gap. A nullable secondary
   cascade likewise does not count, which is precisely the `fleety_turn_signals` gap CMP-2 named.

3. **The gate fails (exit 1) when** a PII candidate is neither covered nor registered, a registry
   entry claims `erased` or `cascade` that the schema does not support (a lie), an allow-list entry
   claims a gap for a table that is now covered (a stale entry), the registry lists a table that is
   no longer a candidate (rot), or an allow-list entry has no substantive reason. **It fails closed
   (exit 2) when** a precondition is missing: no migrations directory, zero migrations, no
   `handle_user_deletion`, no registry, or zero candidates scanned. A misconfiguration must never
   read as a pass.

4. **Discrimination / mutation proof.** `scripts/ci/erasure-completeness-selftest.mjs` is a
   node-runnable harness of 14 scenarios that build throwaway fixtures, copy the real guard in, and
   assert its exit code AND the reason on stderr (an unregistered PII table reds — including one
   hidden behind a `--` comment and one added via `ALTER ADD COLUMN`; a lying, stale, or
   reason-missing registry reds; an INSERT-only table claimed erased reds; and the fail-closed cases
   exit 2). `src/test/smoke/
   check-erasure-completeness.smoke.test.ts` runs that harness in CI, execs the guard once so
   `check-guard-has-test` credits it, and runs the harness a second time against a no-op gate to
   prove the harness itself reddens when the gate is neutralized.

The guard keeps its `// ci-lane: critical` marker, so `emit-guard-matrix` wires it into the
blocking lane with no edit to `ci.yml`, and keeps its `ci-guard-integrity: bespoke-dir-reader`
self-declaration.

## Alternatives considered

- **Keep extending the hand list.** Rejected: it is the root cause. A list unmoored from the schema
  always drifts, and the audit showed it already had.
- **Make the gate red on every uncovered table now, with no allow-list.** Rejected for this PR: the
  real schema has about 36 genuinely uncovered tables. Adding `ON DELETE CASCADE` FKs or erasure for
  them is a production schema change that needs expand/contract migration safety and a pgTAP sweep,
  which is explicitly out of scope here (it is the CMP-2 "Prevent" follow-up, held with RC0). A red
  gate with no remediation path would block every unrelated merge. The allow-list keeps the surface
  visible and tracked while that migration is done, and the audit's own prescribed fix names an
  "allow-list entry with a reason" for exactly this.
- **A purely schema-derived gate with no committed registry.** Rejected: without a committed
  classification, the gate cannot distinguish a genuine orphan (must fix) from staff authorship
  provenance (`created_by` on org content) or a legally retained record, so it would either red on
  false positives or silently auto-cover. The registry is the human-reviewed, machine-verified data
  map, and it is the same map CMP-5 can later drive `export_my_data` from.
- **Runtime pgTAP catalog sweep instead of a static reader.** Complementary, not a replacement, and
  deferred: it needs a live database (CMP-2 "Prevent"). The static gate blocks the bad change at PR
  time with no database; the pgTAP sweep would confirm the live catalog. Both are wanted; this ADR
  delivers the static half.

## Consequences

- The gate now enumerates the full PII surface (89 tables on `main` today: 19 erased, 21 cascade, 9
  author-provenance, 6 retained, 34 orphan) and reconciles each against the schema. A new PII table
  can no longer be added without being classified, and a coverage regression (a later redefinition
  dropping a table, or an FK losing its cascade) reds the gate.
- The 40 orphan/retained tables are now **visible and tracked** instead of invisibly green. Actually
  erasing or de-identifying them is a separate schema-remediation PR (the CMP-2 "Prevent" work, held
  with RC0): one expand migration adding `ON DELETE CASCADE` FKs or explicit erase/de-identify, plus
  a pgTAP sweep. As each table gains a path, its entry moves from `orphan` to `erased`/`cascade`, and
  the gate's stale-entry check forces that update.
- Named limitation (compliance-data-lifecycle, skeptical-audit): the derivation trusts
  migration-declared schema. Production drift (FKs or constraints added outside migrations) is
  not-assessed; the pgTAP catalog sweep against a live database is the complementary runtime check.
  Row-level predicates (a partial erase) are beyond a static reader. The comment strip is naive (it
  does not special-case a `--` inside a string literal, which is vanishingly rare in this DDL and
  would only ADD a candidate, never hide one). The identity surface is uuid identity/authorship
  columns; an email-only PII store with no uuid subject column is out of this heuristic's scope.
- Known LOW residual (judge-arch, tracked for the CMP-2 follow-up): the safe cascade rule (b)
  auto-covers an authorship-only table through a NOT NULL cascade without checking the `created_by`
  column's own `ON DELETE` action — the authorship twin of the subject-column rule. No live orphan
  today (every current instance SET NULLs `created_by`, and `created_by` on org content is
  policy-deemed provenance, not subject PII). The symmetric fix (require the authorship column to
  resolve to auth.users via CASCADE/SET NULL, else demand a reason) is deferred with the schema
  remediation.
- The registry doubles as the start of the organization-wide PII data map the audit asked for
  (CMP-9) and the single source the DSAR export (CMP-5) should later be driven from.
- Evidence: the discrimination and neutralization runs were proven with `node` on a box without the
  TS/Vitest toolchain; CI (the source of truth) runs the smoke test and the critical guard lane.
