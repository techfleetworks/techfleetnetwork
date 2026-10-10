# Runbook — Backup & Disaster Recovery

> **DRAFT for review (enterprise-readiness audit 2026-10, finding H5).** There was no documented
> backup/restore plan, no RTO/RPO, and no tested restore. This defines the targets and the procedures.
> Lines marked **⬜ VERIFY IN PROD** require Supabase dashboard access and cannot be confirmed from the
> repo — do them to turn this draft into a proven plan. (Reality, not a ledger: a backup you have never
> restored is a hypothesis, not a backup.)

## Targets (proposed — confirm with the team)

| Metric | Target | Meaning |
|--------|--------|---------|
| **RPO** (max data loss) | **≤ 5 min** | via Supabase Point-in-Time Recovery (PITR), if the plan tier includes it |
| **RTO** (max downtime to restore) | **≤ 4 h** | time to a working app on a restored DB |
| Backup retention | **≥ 7 days** PITR window (28d daily snapshots if available) | |
| Restore test cadence | **quarterly** | a restore you never test is not a backup |

## What must be backed up / recoverable

1. **Postgres (the system of record)** — all `public.*` data, RLS policies, `SECURITY DEFINER` functions, triggers, cron. Covered by Supabase automated backups + PITR **⬜ VERIFY IN PROD the tier has PITR; the low tier may not**.
2. **Auth users** (`auth.users`) — part of the Supabase DB backup.
3. **Storage buckets** (handoff deliverables, uploads) — **⬜ VERIFY** Supabase Storage backup/retention; Storage is NOT always covered by the DB PITR.
4. **Migrations** — source-of-truth in git (`supabase/migrations/`), forward-only. The schema can be rebuilt from git + `supabase db push`.
5. **Secrets / env** — NOT in git by design. Keep an offline, access-controlled inventory of required secrets (the function env keys) so a new project can be re-provisioned. **⬜ CONFIRM** an inventory exists.
6. **Frontend** — static `dist/` from any commit on `main` (Cloudflare Pages keeps deploy history → instant rollback).

## RPO/RTO verification — the quarterly restore test (the part that makes this real)

Do this against a **throwaway/staging Supabase project**, never prod:

1. **⬜** In the Supabase dashboard, confirm PITR is enabled and note the earliest recoverable timestamp (this proves the RPO window).
2. **⬜** Trigger a PITR restore (or restore the latest snapshot) into a new project.
3. **⬜** Run the schema-drift gate against the restored project: `node scripts/ci/check-db-schema-present.mjs` (it verifies every committed migration's objects exist — reality, not a ledger). Expect green.
4. **⬜** Run the pgTAP suite against the restored DB (the `db-test` job's SQL) to confirm RLS / SECURITY DEFINER / triggers survived.
5. **⬜** Point a local build at the restored project and smoke the four core journeys (sign-in, apply, dashboard, Fleety).
6. **⬜** Record the wall-clock time taken → that is the measured RTO. Update the target if reality differs.
7. **⬜** Tear down the throwaway project.

## DR scenarios → first action

| Scenario | First action (mitigate before diagnosing) |
|----------|-------------------------------------------|
| **Bad migration corrupted/dropped data** | PITR restore to the timestamp *just before* the migration applied; then fix the migration forward (expand/contract) — the `check-migration-expand-contract` guard now blocks the in-place-destructive class pre-merge. |
| **Accidental mass delete / bad RPC** | PITR restore to just before the event; re-apply any legitimate writes since from `ops_events`/`audit_log` if needed. |
| **Full project loss** | New Supabase project → `supabase db push` (rebuild schema from git) → restore data from latest backup → re-provision secrets from the offline inventory → repoint DNS/env. |
| **Frontend bad deploy** | Cloudflare Pages → roll back to the previous deployment (instant); the `verify-deploy` stale-bundle check confirms the live SHA. (See `rollback.md`.) |
| **Edge function regression** | Redeploy the previous commit's functions via `deploy-edge-functions.yml`; kill-switch feature flags (safe-default-OFF) disable a broken path without a deploy. |
| **Audit-log integrity in question** | The `audit_log` hash-chain `verify` function detects tampering; an off-box copy (see audit finding H6 / PR-13) is the durable second record. |

## Owner & review

- Owner: _(assign)_. Review this doc + run the restore test **quarterly** and after any change to the Supabase plan tier.
- Related: `rollback.md` (deploy rollback), `db-retention.md` (retention), `post-cutover-apply-order.md` (migration ordering).
