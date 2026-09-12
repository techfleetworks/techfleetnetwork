# ADR 0039 — Right-to-erasure completeness is enforced by a guard, not by hoping the function stays whole

- Status: Accepted
- Date: 2026-09-11
- Deciders: TechFleet (owner)
- Related: `supabase/migrations/20260911120000_erasure_completeness_reconcile.sql` (the definitive `handle_user_deletion`), `scripts/ci/check-erasure-completeness.mjs` + `src/test/smoke/check-erasure-completeness.smoke.test.ts` (the guard), `supabase/tests/h9_erasure_cascade_test.sql` + `supabase/tests/gdpr_erasure_email_gumroad_test.sql` (behavioral proof), ADR-0026 (expand/contract — why back-dated migrations are dangerous), ADR-0023 (guards must discriminate). Audit finding H9 (right-to-erasure completeness). Skills: compliance-data-lifecycle, owasp-secure-coding-bdd, bdd-comprehensive-testing, release-deployment-safety, arch-encode.

## Context and problem statement

`public.handle_user_deletion()` (BEFORE DELETE ON `auth.users`) is the single entrypoint for GDPR Art. 17 right-to-erasure: when an account is deleted, it must erase or de-identify every table holding that user's PII that has no `ON DELETE CASCADE` FK. It is **`CREATE OR REPLACE`d by a dozen migrations** over the project's life — and because each redefinition replaces the _entire_ function body, a later migration that reconstructs the function from a **stale copy** silently drops whatever an earlier (or back-dated) migration added.

That is not hypothetical — it shipped. `20260810130001_h9_complete_erasure_cascade` added erasure/de-identification for four PII-orphan tables (`gumroad_sales`, `cookie_consents`, `support_provisioning_log`, `support_ticket_events`). It is dated Aug 10 but was merged **after** `20260812180000_handoff_dsar_retention` (Aug 12), which had `CREATE OR REPLACE`d the function "preserving every existing cleanup verbatim" — from the pre-h9 state. On a fresh `db reset`, migrations apply in timestamp order, so handoff_dsar (Aug 12) wins and **h9's block vanishes**: a deleted user's PII orphans in `cookie_consents` and the two support logs, and `gumroad_sales.resolved_user_id` is never nulled. `h9_erasure_cascade_test` caught it (4/6 failing) — but only because someone had written that test; nothing _structural_ prevented the regression, and nothing forces the next redefinition to stay complete.

The root problem is a class, not a bug: **erasure completeness lived only in the current text of a frequently-rewritten function, with no invariant tying redefinitions to the full PII surface.**

## Decision drivers

- **A right-to-erasure gap is a compliance incident**, not a cosmetic regression — it must be impossible to ship silently.
- **The function will keep being rewritten.** New features add PII tables; new migrations `CREATE OR REPLACE` the function. The safeguard must survive arbitrary future redefinitions.
- **Fail-safe over fail-open.** A missing table must turn CI red, not pass quietly.
- **No dependency on prod or a live DB** — the check must run statically in CI from any clone (the same constraint as ADR-0035/0036).
- **arch-encode principle:** a caught mistake becomes a durable, tested, enforceable rule — not a comment saying "don't forget the tables."

## Considered options

1. **Fix the function, rely on the existing pgTAP test.** Reconcile `handle_user_deletion` and lean on `h9_erasure_cascade_test`. Rejected as _sufficient_: the pgTAP suite is `db-test`, which is INFORMATIONAL (not in the blocking gate), and it only covers the tables someone remembered to assert — a newly-added PII table with no test would regress invisibly.
2. **Reconcile the function + add a static completeness guard (chosen).** A forward migration makes the winning definition the complete UNION, and a blocking CI guard asserts the _last_ `handle_user_deletion` definition names every registered PII table — so any future redefinition that drops one fails CI.
3. **Forbid re-defining the function; require ALTER-only patches.** Not enforceable in Postgres (there is no partial-function edit) and hostile to the expand/contract convention.
4. **Move all PII tables to `ON DELETE CASCADE` FKs.** Right for some tables, but wrong for the ones that must be RETAINED-but-de-identified (financial ledger, proof-of-consent) — cascade would delete rows a legal-retention obligation says to keep.

## Decision outcome

**Chosen: Option 2.**

- **`20260911120000_erasure_completeness_reconcile.sql`** is the definitive `handle_user_deletion`: the UNION of the h9 cascade and the handoff-DSAR block, applied last so it wins regardless of the earlier ordering. `gumroad_sales` de-identification is reconciled to the value the `gdpr_erasure_email_gumroad_test` asserts (`erased@gdpr.invalid` + `raw_payload '{}'`) plus h9's `resolved_user_id = NULL`; every orphan table is `to_regclass`-guarded and the whole function is idempotent. (The same PR renames `20260810130000_h9_complete_erasure_cascade` → `…130001` to clear a pre-existing timestamp collision with `…_gdpr_erasure_email_gumroad_pii`.)
- **`scripts/ci/check-erasure-completeness.mjs`** (blocking, in `lint-arch-critical`) finds the highest-timestamp migration that `CREATE OR REPLACE`s the function and fails closed unless its body names every table in a committed `REQUIRED` list. Adding a PII table to `REQUIRED` forces it to stay covered forever; removing one (because it moved to an FK cascade) is a reviewed line with a reason. Registered as a bespoke reader in `check-ci-guard-integrity`; pinned by a 6-scenario smoke test that includes the exact clobber (a later redefinition dropping a table → red).

## Consequences

**Good**

- The clobber class is structurally dead: a redefinition that drops a registered PII table cannot merge. Completeness no longer depends on remembering to write a pgTAP assertion.
- The behavioral proof (`h9_erasure_cascade_test`, now 6/6) and the static guard are complementary — one proves the function _works_, the other proves it _stays complete_ as it is rewritten.

**Bad / accepted**

- **The guard checks presence of a table NAME in the winning body, not that the erase is semantically correct.** A redefinition that mentions a table but with a broken predicate would pass the static guard — that residual is covered by the pgTAP behavioral test. Accepted: the two layers together close both "table dropped" and "table mishandled."
- **`REQUIRED` is hand-maintained.** A new PII table added without a `REQUIRED` entry is not auto-detected. Accepted: the same reviewed-ratchet cost as every allowlist in the repo; a future enhancement could derive candidates from columns referencing `auth.users`.

## Confirmation

- `src/test/smoke/check-erasure-completeness.smoke.test.ts` (6 scenarios): complete→0, omits-a-table→1, later-redefinition-drops-a-table→1 (the clobber), no-definition→2, no-migrations-dir→2, real-repo→0. Discriminates under the mutation gate.
- `supabase/tests/h9_erasure_cascade_test.sql` (6/6) proves the reconciled function erases/de-identifies all four orphan tables; `gdpr_erasure_email_gumroad_test.sql` stays green on the canonical redaction value.
- `check-guard-has-test` + `check-guards-wired` + `check-ci-guard-integrity` all green with the new guard.
