# Migration auto-apply — one-time activation runbook (ADR-0045)

`.github/workflows/deploy-migrations.yml` auto-applies migrations to prod on merge to `main`
(`supabase db push`). It preflights its secrets and no-ops-with-an-error until the three one-time
steps below are done — so merging the workflow is safe; it does nothing until you activate it.

`supabase db push` compares `supabase/migrations/` to the remote `supabase_migrations.schema_migrations`
**ledger**. This repo predates any ledger (the Lovable cutover — the deep reason migrations have been
hand-applied). So activation is: get prod in sync, seed the ledger, add the secret.

## Step 1 — Confirm prod is in sync with main

The ADR-0036 `db-schema-gate` must be **green on `main`** (every declared object exists in prod). If it
is red, apply the missing migrations first (the gate names them). Do NOT bootstrap the ledger while prod
is behind — you would mark unapplied migrations as "applied" and freeze the drift in.

## Step 2 — Bootstrap the ledger (mark every current migration as applied)

**Preferred — one click, no local setup** (uses the `SUPABASE_DB_PASSWORD` secret from Step 3, so do
Step 3 first, and merge this PR so the workflow is on `main` and thus dispatchable):

> GitHub → Actions → **Deploy migrations** → **Run workflow** → set **mode = `bootstrap-ledger`** → Run.

That job marks every migration in the repo as applied and then runs `supabase db push --dry-run`,
which must end with **no pending migrations**. Only run it after Step 1 (prod == main) — otherwise it
would mark unapplied migrations "applied" and freeze the drift in.

**Alternative — locally**, from the repo root, with the CLI (v2.30.4) authenticated
(`SUPABASE_ACCESS_TOKEN`) and the prod DB password:

```bash
supabase link --project-ref pzvqxdgoztbfikfuifix   # prompts for the DB password
supabase migration repair --status applied $(ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/_.*//')
supabase db push --dry-run   # must report: no pending migrations
```

## Step 3 — Add the repo secret

`SUPABASE_DB_PASSWORD` — the prod database password (Supabase → Settings → Database → Database
password). `SUPABASE_ACCESS_TOKEN` is already present (used by `deploy-edge-functions.yml`).

## After activation

- Every merge to `main` that touches `supabase/migrations/**` runs `supabase db push` automatically;
  the run log always shows a `--dry-run` first, then the apply.
- Prod can no longer silently fall behind `main`.
- The ADR-0036 `db-schema-gate` stays on as the post-apply detector: if a push ever fails, the next
  PR's gate reddens on the drift.
- Recovery / ad-hoc: run the workflow manually (Actions → Deploy migrations → Run workflow) — check
  `dry_run` to preview without applying.
