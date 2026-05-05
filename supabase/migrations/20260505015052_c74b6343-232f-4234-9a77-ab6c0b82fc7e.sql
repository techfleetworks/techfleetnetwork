
-- Unschedule any prior version (idempotent setup)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'triage-digest-daily') THEN
    PERFORM cron.unschedule('triage-digest-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'triage-digest-daily',
  '0 15 * * *',  -- 15:00 UTC daily (~8am PT / 11am ET)
  $$
  SELECT net.http_post(
    url := 'https://iqsjhrhsjlgjiaedzmtz.supabase.co/functions/v1/triage-digest-builder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron', 'scheduled_at', now())
  ) AS request_id;
  $$
);
