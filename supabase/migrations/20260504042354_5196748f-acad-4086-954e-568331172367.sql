DO $$
DECLARE
  v_url text := 'https://iqsjhrhsjlgjiaedzmtz.supabase.co/functions/v1/email-pipeline-health';
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'email_queue_service_role_key'
   LIMIT 1;

  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'email-pipeline-health-every-15m';

  PERFORM cron.schedule(
    'email-pipeline-health-every-15m',
    '*/15 * * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body    := '{}'::jsonb
      );
      $cmd$,
      v_url, v_key
    )
  );
END $$;

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type)
VALUES
('email-pipeline-health', 1, 'EPH-001', 'Probe dedupes by message_id and does not flag healthy templates',
$g$Feature: Generic email pipeline health probe
  Scenario: Healthy template with completed sends is not flagged
    Given email_send_log contains a 'pending' row and a later 'sent' row sharing the same message_id for template 'transactional_emails'
    When email-pipeline-health runs
    Then [Code] email_send_log_latest_stuck returns 0 rows for that template
    And  [DB] no new audit_log row with event_type 'email_transactional_pipeline_unhealthy' is written
    And  [UI] System Health > Top Errors does not list the transactional pipeline as unhealthy
$g$, 'not_built', 'manual'),
('email-pipeline-health', 1, 'EPH-002', 'Probe writes audit_log when latest status is stuck or failed',
$g$Feature: Generic email pipeline health probe
  Scenario: Stuck pending or recent failed sends are reported
    Given a 'pending' row older than 15 minutes with no later status row exists for template 'recovery'
    When email-pipeline-health runs
    Then [Code] the function increments stuck_pending in its result for template 'recovery'
    And  [DB] an audit_log row with event_type 'email_password_recovery_pipeline_unhealthy' is inserted with non-null error_message
    And  [UI] System Health > Top Errors shows the password recovery pipeline alert within the next refresh
$g$, 'not_built', 'manual')
ON CONFLICT (scenario_id) DO UPDATE SET
  gherkin = EXCLUDED.gherkin,
  title = EXCLUDED.title,
  updated_at = now();