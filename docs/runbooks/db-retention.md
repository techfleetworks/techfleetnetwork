# Runbook: DB Retention & Hygiene

Bounds DB growth to ~3 GB/yr (was ~12 GB/yr). Keeps Cloud spend inside the included $25/mo balance even in viral months.

## Schedules

| Job | Frequency | Retention | Purpose |
|-----|-----------|-----------|---------|
| `prune_cron_job_run_details()` | Daily | 7 days | Reclaims ~2.2 GB; capped at 50 MB rolling |
| `prune_email_send_log()` | Daily | 90 days | Bounded delivery audit trail |
| `audit_log` | **NEVER pruned** | ∞ | SOC 2 hash-chain integrity |
| `process-email-queue` cron | Every 60s | — | Safety net only — `notify_email_queue_worker` trigger handles real-time delivery via `pg_net` |

## What changed (Phase 4)

- **Cron history**: was unbounded (2.2 GB and growing +30 GB/yr). Now 7d rolling, daily prune.
- **Email queue**: was 5s polling = 518K invocations/mo (mostly empty). Now insert trigger fires `process-email-queue` via `pg_net` (~1s latency); 60s cron is safety net only. Cuts ~510K invocations/mo.
- **Email send log**: 90d retention.

## Monitoring

- **Self-healing alert** fires when `cron.job_run_details` > 500 MB or DB grows > 500 MB/wk.
- Check `pg_stat_user_tables` for unexpected hot tables.
- `select pg_size_pretty(pg_database_size(current_database()))` for total.

## If an alert fires

1. `select schemaname, relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 20;` — find culprit.
2. If cron history: confirm `prune_cron_job_run_details` cron is enabled in `cron.job` and ran recently.
3. If email log: confirm `prune_email_send_log` cron ran.
4. **Never** run a manual `DELETE` on `audit_log` — breaks SOC 2 hash chain. Escalate instead.

## Rollback

- Email queue NOTIFY trigger misses → drop trigger; revert `process-email-queue` cron to 5s. Worst case is 5s send latency (was the prior baseline).
- Pruning too aggressive → raise the `WHERE created_at < now() - interval '7 days'` window in `prune_cron_job_run_details()`.
