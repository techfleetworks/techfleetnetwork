
-- ────────────────────────────────────────────────────────────────────
-- 1. Cron history pruning (7-day rolling)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details()
RETURNS TABLE (deleted_rows BIGINT, freed_after_size TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE v_count BIGINT;
BEGIN
  DELETE FROM cron.job_run_details
   WHERE end_time < (now() - interval '7 days')
      OR (end_time IS NULL AND start_time < (now() - interval '7 days'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count, pg_size_pretty(pg_total_relation_size('cron.job_run_details'));
END;$$;

REVOKE ALL ON FUNCTION public.prune_cron_job_run_details() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_cron_job_run_details() TO service_role;

-- Schedule: daily 03:00 UTC
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'prune-cron-job-run-details';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
  PERFORM cron.schedule(
    'prune-cron-job-run-details',
    '0 3 * * *',
    $cron$ SELECT public.prune_cron_job_run_details(); $cron$
  );
END$$;

-- Immediate one-shot reclaim
SELECT public.prune_cron_job_run_details();

-- ────────────────────────────────────────────────────────────────────
-- 2. Email send log pruning (90-day retention)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_email_send_log()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count BIGINT;
BEGIN
  DELETE FROM public.email_send_log WHERE created_at < (now() - interval '90 days');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;$$;

REVOKE ALL ON FUNCTION public.prune_email_send_log() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_email_send_log() TO service_role;

DO $$
DECLARE v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'prune-email-send-log';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
  PERFORM cron.schedule(
    'prune-email-send-log',
    '10 3 * * *',
    $cron$ SELECT public.prune_email_send_log(); $cron$
  );
END$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. Email queue NOTIFY trigger — push instead of poll
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_email_queue_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_net
AS $$
DECLARE
  v_url   TEXT;
  v_key   TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault unavailable; the 60s safety-net cron will pick this up.
    RETURN NEW;
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('source', 'pgmq_notify', 'enqueued_at', now()),
    timeout_milliseconds := 2000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let queue notification fail an enqueue; cron is the safety net.
  RETURN NEW;
END;$$;

REVOKE ALL ON FUNCTION public.notify_email_queue_worker() FROM PUBLIC, anon, authenticated;

-- Attach to both pgmq queue tables (auth + transactional). pgmq uses q_<name>.
DROP TRIGGER IF EXISTS trg_notify_email_worker_auth ON pgmq.q_auth_emails;
CREATE TRIGGER trg_notify_email_worker_auth
AFTER INSERT ON pgmq.q_auth_emails
FOR EACH ROW EXECUTE FUNCTION public.notify_email_queue_worker();

DROP TRIGGER IF EXISTS trg_notify_email_worker_tx ON pgmq.q_transactional_emails;
CREATE TRIGGER trg_notify_email_worker_tx
AFTER INSERT ON pgmq.q_transactional_emails
FOR EACH ROW EXECUTE FUNCTION public.notify_email_queue_worker();

-- ────────────────────────────────────────────────────────────────────
-- 4. Slow safety-net cron from 5s -> 60s
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'process-email-queue';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, schedule := '* * * * *');
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────
-- 5. BDD scenarios
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status)
VALUES
('Cost / DB Hygiene', 32, 'F-DB-001',
 'Cron history pruned to 7 days',
$g$Feature: Cron run-history retention
  Scenario: Daily prune keeps last 7 days only
    Given cron.job_run_details contains rows older than 7 days
    When the prune-cron-job-run-details cron job fires
    Then [Code] public.prune_cron_job_run_details() returns the deleted row count
    And [DB] no rows in cron.job_run_details have end_time < now() - interval '7 days'
    And [UI] System Health > Database storage shows reduced cron history size$g$,
 'not_built'),
('Cost / DB Hygiene', 32, 'F-DB-002',
 'Email queue NOTIFY drives sub-second send latency',
$g$Feature: Email queue push delivery
  Scenario: Enqueue triggers immediate worker call
    Given an admin enqueues a transactional email via send-transactional-email
    When the row is inserted into pgmq.q_transactional_emails
    Then [Code] trigger trg_notify_email_worker_tx invokes net.http_post to /functions/v1/process-email-queue
    And [DB] email_send_log gains a "sent" row within 5 seconds
    And [UI] the recipient sees the email in their inbox without waiting for the 60s safety-net cron
  Scenario: Vault outage falls back to safety-net cron
    Given the vault secret 'email_queue_service_role_key' is missing
    When a transactional email is enqueued
    Then [Code] notify_email_queue_worker() returns NEW without raising
    And [DB] the message remains visible in pgmq.q_transactional_emails
    And [UI] the email is delivered within ~60 seconds via the cron safety net$g$,
 'not_built')
ON CONFLICT (scenario_id) DO NOTHING;
