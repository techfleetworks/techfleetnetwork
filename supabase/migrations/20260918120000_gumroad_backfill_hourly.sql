-- Gumroad backfill backstop: weekly cadence → HOURLY (ADR-0044).
--
-- Why: the real-time webhook (gumroad-webhook) is the PRIMARY path; this job is the
-- self-healing backstop that ingests anything the webhook misses. At WEEKLY cadence a
-- dark webhook went unnoticed for ~6 weeks (the Aug-2026 Gumroad Ping secret-mismatch:
-- every event 403'd, so 100% of sales arrived only via this job). Hourly bounds the
-- detect + self-heal window to ≤1h. Paired with the gumroad-backfill-all change in the
-- same PR, which now emits `gumroad_webhook_gap_detected` (severity error) whenever a
-- run ingests a sale the webhook missed — so a mis-wired webhook can never fail SILENTLY.
--
-- The job NAME is intentionally kept as 'gumroad-backfill-all-weekly' even though it now
-- runs hourly: `public.environment_readiness()` (20260826140000) lists that exact name in
-- its expected-cron watchdog, and the fail-closed config-preflight gate reads it. Renaming
-- here would desync that watchdog (false "missing cron" → permanent red gate) and drop the
-- job's presence monitoring. Adding a staleness (dead-man's-switch) threshold for the now-
-- hourly job — moving its environment_readiness entry into the staleness-enforced list —
-- is a focused follow-up on that function; until then it keeps presence + last-run-failed
-- coverage (environment_readiness checks 4 & 5).
--
-- Idempotent: unschedule any prior weekly/hourly variant, then schedule. Same Vault-secret
-- COALESCE auth pattern as 20260803160500_gumroad_backfill_all_cron. Requires pg_cron
-- (already enabled). Runs at :11 past every hour (offset from other jobs).

DO $$
DECLARE
  v_url text := 'https://pzvqxdgoztbfikfuifix.supabase.co';
  v_auth text := $auth$'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1)
      )$auth$;
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('gumroad-backfill-all-weekly', 'gumroad-backfill-all-hourly');
  -- Name kept as '…-weekly' for environment_readiness() watchdog continuity (see header).
  PERFORM cron.schedule(
    'gumroad-backfill-all-weekly',
    '11 * * * *',                    -- hourly at :11 (was '11 9 * * 0', Sundays)
    format($cmd$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %s),
        body := jsonb_build_object('source', 'cron', 'scheduled_at', now()),
        timeout_milliseconds := 60000
      );
    $cmd$, v_url || '/functions/v1/gumroad-backfill-all', v_auth)
  );
END $$;
