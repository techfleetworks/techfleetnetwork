-- Remove the Refactor-KPIs dashboard and the Deliverability tab's admin-only backend
-- (owner decision — ADR-0054). The System Health page no longer renders the "Refactor KPIs"
-- or "Deliverability" tabs, so nothing calls these objects any more.
--
-- CONTRACT migration (expand/contract, ADR-0026). This is destructive and forward-only. It is
-- safe to leave applied if the frontend later rolls back, because the rolled-back UI still does
-- not call these objects (the tabs were removed, not feature-flagged). Ordering for prod
-- (db push is NOT atomic with the Cloudflare Pages deploy): merge → Pages ships the tab removal →
-- confirm the tabs are gone → THEN apply this migration. Applying it early only 404s an
-- already-removed UI surface; it can never strand a live one.
--
-- Dropped:
--   * cron  snapshot-refactor-kpis-daily            (daily KPI snapshot; not in environment_readiness coverage)
--   * trigger trg_broadcast_refactor_kpi_change      on refactor_kpi_daily
--   * functions  broadcast_refactor_kpi_change, snapshot_refactor_kpis, _upsert_kpi,
--                get_refactor_kpis, run_refactor_kpis_snapshot_now  (Refactor-KPIs subsystem)
--   * functions  get_stuck_pending_email_count, clear_email_lane_cooldown  (Deliverability throttle card)
--   * tables  refactor_kpi_daily, refactor_kpi_catalog (CASCADE clears their indexes, RLS, policies, FK)
--
-- UNAFFECTED (shared / core pipeline — intentionally kept): email_send_state, email_domain_health,
-- validate-email-domain, replay-email-dlq (the automated 5-min DLQ drain), refresh-email-health.

-- 1) Cron: stop the daily snapshot job. Guarded so a pg_cron-less shadow DB is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'snapshot-refactor-kpis-daily';
  END IF;
END $$;

-- 2) Trigger before its function (the trigger depends on broadcast_refactor_kpi_change).
DROP TRIGGER IF EXISTS trg_broadcast_refactor_kpi_change ON public.refactor_kpi_daily;

-- 3) Functions. Signatures pinned so the drop matches the exact identity that was created.
DROP FUNCTION IF EXISTS public.broadcast_refactor_kpi_change();
DROP FUNCTION IF EXISTS public.run_refactor_kpis_snapshot_now();
DROP FUNCTION IF EXISTS public.get_refactor_kpis(integer);
DROP FUNCTION IF EXISTS public.snapshot_refactor_kpis();
DROP FUNCTION IF EXISTS public._upsert_kpi(date, text, numeric, text, text, bigint, bigint);
DROP FUNCTION IF EXISTS public.get_stuck_pending_email_count(integer);
DROP FUNCTION IF EXISTS public.clear_email_lane_cooldown(text);

-- 4) Tables. Child (FK → catalog) first; CASCADE clears indexes, RLS, policies, and the
--    refactor_kpi_daily_key_date_idx / unique constraint along with the rows.
DROP TABLE IF EXISTS public.refactor_kpi_daily CASCADE;
DROP TABLE IF EXISTS public.refactor_kpi_catalog CASCADE;
