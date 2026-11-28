# Applying migrations to prod — the reviewer-gated flow + one-time activation (ADR 20261126)

`.github/workflows/apply-migrations-prod.yml` applies `supabase/migrations/*` to the prod Supabase
project as a **reviewer-gated, human-dispatched** pipeline step. It replaces the old unattended
on-merge applier (`deploy-migrations.yml`, ADR-0045, now deleted): an on-merge apply runs **after**
merge, but ADR-0036's `db-schema-gate` blocks a migration PR from merging **until prod already has the
declared objects** — so the apply has to run **before** merge. This workflow does that, on the PR branch,
with a human approving each prod DDL change.

`supabase db push` compares `supabase/migrations/` to the remote `supabase_migrations.schema_migrations`
**ledger**. This repo predates any ledger (the Lovable cutover — the deep reason migrations were ever
hand-applied). So the one-time activation is: add the secret + environment, get prod in sync, seed the
ledger.

## The normal flow for a migration PR

1. Open the PR. `migration-smoke` proves the migration applies cleanly from scratch; `db-schema-gate` is
   **red** — expected, prod doesn't have the new objects yet. Review the PR as usual.
2. **Preview first (recommended):** Actions → Apply migrations to prod → Run workflow → **Use workflow from =
   the PR's branch**, **mode = `dry-run`** → approve → read the log to confirm the pending set is exactly this
   PR's migrations. (The in-job dry-run during a `push` runs *after* you approve, so it logs but does not gate —
   this separate dry-run is how you see the set *before* approving an apply.)
3. **Apply:** run the workflow again on the **same branch**, **mode = `push`**. The apply job runs in the
   protected **`production` Environment**, so a **required reviewer approves** before anything touches prod;
   only then is `SUPABASE_DB_PASSWORD` exposed. A **branch-freshness guard** fails the run if the branch is
   diverged from `origin/main` (rebase onto current main and retry). It then applies only the pending
   migrations, in version order. **Before approving, check the branch does not modify
   `.github/workflows/apply-migrations-prod.yml` itself** — the ref's own YAML runs with the password.
4. Prod now has the objects. **Re-run `db-schema-gate`** on the PR (re-run the CI job, or push an empty
   commit) — it goes **green**. Merge the PR normally. Nothing applies on merge.

**If a migration PR is abandoned, rebased, or its migration is renamed/re-timestamped after you applied it:**
prod may now hold a migration that is not on `main` (reverse drift — `db-schema-gate` only detects *missing*
objects, not extras). Run the workflow on `main` with **mode = `dry-run`**; if it reports anything unexpected,
reconcile the ledger (`supabase migration repair`) before the next apply.

Because `db-schema-gate` cannot go green until prod is in sync, prod **cannot silently fall behind
`main`**: a migration is in prod *before* its PR merges. `db-schema-gate` on `main` plus the daily
`config-preflight.yml` sweep remain the post-merge detector for out-of-band drift.

## One-time activation

### Step 1 — Create the protected `production` Environment

GitHub → **Settings → Environments → New environment** → name it **`production`**.

- **Add a required reviewer** (the owner / a maintainer). This is the human approval gate — every apply
  pauses until someone approves.
- **Deployment branches policy: leave it PERMISSIVE (all branches). Do NOT restrict to `main`.** This
  workflow runs on **PR branches** by design (pre-merge apply); a `main`-only policy would block the exact
  flow above. The required reviewer — not a branch restriction — is the control.

### Step 2 — Add the DB password as an environment secret

On the `production` environment, add secret **`SUPABASE_DB_PASSWORD`** — the prod database password
(Supabase → Settings → Database → Database password). Scoping it to the environment **and not at repo
scope** means it is exposed only after the reviewer approves; a repo-scoped copy would let a dispatch run
prod DDL *without* approval, so do not create one. `SUPABASE_ACCESS_TOKEN` already exists as a repo secret
and is reused.

**Confirm the gate is live (once):** GitHub silently creates a missing environment with *no* reviewers, so
after Steps 1–2 dispatch one run and confirm it **pauses for approval**. If it runs without pausing, the
required reviewer is missing or the password is repo-scoped — fix it before trusting the gate.

### Step 3 — Confirm prod is in sync with `main`

The ADR-0036 `db-schema-gate` must be **green on `main`** (every declared object exists in prod). If it is
red, apply the missing migrations first (via this workflow, mode=push, on `main`). Do **not** bootstrap the
ledger while prod is behind — you would mark unapplied migrations "applied" and freeze the drift in.

### Step 4 — Bootstrap the ledger (mark every current migration as applied)

One click, no local setup:

> Actions → **Apply migrations to prod** → **Run workflow** → **mode = `bootstrap-ledger`** → Run → approve.

That job marks every migration in the repo as applied, then runs `supabase db push --dry-run`, which must
end with **no pending migrations**. Only run it after Step 3 (prod == main).

## After activation

- Every migration PR follows "the normal flow" above: dispatch the apply on the PR branch, a reviewer
  approves, prod gets the objects, `db-schema-gate` goes green, merge.
- The prod DB password never leaves GitHub — no local `supabase db push`, no password on a laptop.
- No prod DDL ever runs unattended: the workflow has only a `workflow_dispatch` trigger (no `push`/PR), and
  every apply is behind the `production` environment's required reviewer.
- Recovery / ad-hoc apply on `main`: same workflow, select `main`, mode=push (or `dry-run` to preview).
