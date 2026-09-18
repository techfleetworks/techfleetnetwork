# ADR 0045 — Migrations auto-apply to prod on merge; prod can't silently fall behind main

- Status: Accepted
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `.github/workflows/deploy-migrations.yml` (the applier), `.github/workflows/deploy-edge-functions.yml` (the pattern this mirrors), ADR-0036 / `scripts/ci/check-db-schema-present.mjs` (the detector this closes the loop on), ADR-0026 (expand/contract — why auto-apply is safe), `ci.yml` `migration-smoke` (the pre-merge proof), `docs/architecture/audit-2026-08/migration-auto-apply.md` (the one-time activation runbook). Skills: `release-deployment-safety`, `compliance-data-lifecycle`, `sre-operational-readiness`.

## Context and problem statement

Every deploy path in this repo is automated on merge to `main` **except the database**: `deploy-edge-functions.yml` pushes functions, the frontend auto-builds — but a merged migration just sits in `supabase/migrations/` until a human hand-runs the SQL in the Supabase Dashboard. Miss one and prod **silently falls behind `main`**. That is not hypothetical: it caused the Discord-linking PGRST202 outage (migration `20260809161000` never applied), and in this very session the ADR-0036 gate surfaced _multiple_ accumulated unapplied migrations (the gumroad multi-email set, then `trg_gumroad_sales_purchase_email`), each requiring a manual SQL paste.

ADR-0036 built the **detector** — a blocking gate that fails a PR when a declared object is missing from prod. But a detector only tells you prod has _already_ drifted; it does not stop drift from recurring. The root cause is the missing **applier**: there is no automated step that puts a merged migration into the database.

## Decision drivers

- **Remove the root cause, not just detect it.** "Remember to run the SQL" is the failure mode; the only structural fix is to have no human step to forget.
- **Consistency with the established pattern.** Edge functions already auto-deploy on merge; the DB is the lone exception. Same trust model, same blast radius controls.
- **Safety before automation.** Auto-applying schema to prod is only acceptable because the pre-merge and post-apply safety nets already exist.
- **No silent partial state.** The applier must fail loudly, never apply a wrong baseline, and be idempotent/serialized.

## Considered options

1. **Keep hand-applying via the SQL Editor (status quo).** Rejected: it _is_ the root cause. The detector keeps reddening; prod keeps lagging; a copy-paste is one forgotten step from the next outage.
2. **Manual `workflow_dispatch` applier.** A human clicks "Run"; the CLI applies exactly what's in `main` against the ledger. Removes the copy-paste error surface but keeps a human gate — so prod can still lag until someone clicks. Better, not structural. (Retained as the dry-run / recovery entrypoint.)
3. **Auto-apply on merge (chosen).** `deploy-migrations.yml` runs `supabase db push` on every merge to `main` touching `supabase/migrations/**`. Zero human step → prod cannot silently lag.

## Decision outcome

**Chosen: Option 3**, gated by the safety nets that make auto-applying schema to prod responsible:

- **`.github/workflows/deploy-migrations.yml`** — on push to `main` under `supabase/migrations/**` (and `workflow_dispatch` with a `--dry-run` input): install the pinned Supabase CLI, `supabase link`, log `supabase db push --dry-run`, then `supabase db push`. It applies ONLY migrations the remote ledger has not seen, in version order — never a reset. Concurrency-serialized so two pushes never race the DB. Preflights `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` and fails with a clear message if absent (never applies against a wrong baseline).
- **The safety nets that make it safe:** `migration-smoke` (BLOCKING in `ci.yml`) already proves every migration applies cleanly from scratch on a fresh Postgres _before_ it can merge; the expand/contract convention (ADR-0026) keeps a merged migration backward-compatible with the running app; and ADR-0036's `db-schema-gate` stays on as the **post-apply detector** — belt-and-suspenders, so a failed push reddens the next PR.
- **One-time activation** (see `migration-auto-apply.md`), required because the repo predates any `supabase_migrations.schema_migrations` ledger (the Lovable cutover — the deep reason this was ever manual): (1) prod in sync with `main` (ADR-0036 gate green); (2) bootstrap the ledger — mark every current migration applied so `db push` has an accurate baseline; (3) add the `SUPABASE_DB_PASSWORD` repo secret.

## Consequences

**Good**

- Prod can no longer silently fall behind `main` — the outage class (PGRST202 / missing-object) is structurally dead: there is no manual apply step to skip.
- The detector (ADR-0036) and the applier (this) now form a closed loop: a merged migration is applied automatically, and any residual drift is still caught.
- The DB joins edge functions and the frontend under one consistent auto-on-merge deploy model.

**Bad / accepted**

- **A bad migration now reaches prod without a human gate.** Accepted because `migration-smoke` blocks any migration that doesn't apply cleanly, and expand/contract forbids a backward-incompatible change — the same bar every other auto-deploy already trusts. `workflow_dispatch --dry-run` and the post-apply detector remain as checks.
- **A new repo secret (`SUPABASE_DB_PASSWORD`) and a one-time ledger bootstrap** are operational cost. Accepted: one-time, documented, and the price of never hand-pasting SQL again.
- **`db push` trusts the ledger.** If the ledger is wrong, the wrong set applies — which is exactly why the one-time bootstrap must run only after prod is confirmed in sync, and why the ADR-0036 detector stays on to catch any mismatch.

## Confirmation

- `deploy-migrations.yml` runs `supabase db push --dry-run` before applying (visible in every run log), preflights its secrets, and is concurrency-serialized.
- ADR-0036 `db-schema-gate` remains green on `main` as the post-apply invariant: after any merge, declared objects must exist in prod — the automated proof that the applier did its job.
- The one-time bootstrap is verified by a green `db-schema-gate` on `main` immediately after it runs (prod == main), and by `supabase db push --dry-run` reporting "no pending migrations".
