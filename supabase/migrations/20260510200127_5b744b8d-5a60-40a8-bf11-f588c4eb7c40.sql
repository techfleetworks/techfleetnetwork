
CREATE OR REPLACE FUNCTION public.kick_community_events_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_net
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
  v_err TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
    IF v_url IS NULL THEN
      SELECT decrypted_secret INTO v_url
        FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    END IF;
    IF v_url IS NULL THEN
      v_url := current_setting('app.settings.supabase_url', true);
    END IF;

    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
    IF v_key IS NULL THEN
      SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
    END IF;
    IF v_key IS NULL THEN
      SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    END IF;
    IF v_key IS NULL THEN
      v_key := current_setting('app.settings.service_role_key', true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF v_url IS NULL OR v_key IS NULL OR v_err IS NOT NULL THEN
    UPDATE public.community_events_cache
      SET last_refresh_status = 'config_error',
          last_refresh_error  = COALESCE(v_err, 'vault secrets missing: supabase_url/service_role_key not found'),
          updated_at          = now()
      WHERE id = 1;
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := rtrim(v_url, '/') || '/functions/v1/refresh-community-events',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('source', 'cron', 'at', now()),
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.community_events_cache
      SET last_refresh_status = 'kick_error',
          last_refresh_error  = SQLERRM,
          updated_at          = now()
      WHERE id = 1;
  END;
END;$$;

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'refresh-community-events';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'refresh-community-events',
    '*/10 * * * *',
    $cron$ SELECT public.kick_community_events_refresh(); $cron$
  );

  PERFORM public.kick_community_events_refresh();
END$$;

CREATE OR REPLACE FUNCTION public.get_community_events_health()
RETURNS TABLE (
  last_refresh_status TEXT,
  last_refresh_error  TEXT,
  fetched_at          TIMESTAMPTZ,
  event_count         INTEGER,
  updated_at          TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT last_refresh_status, last_refresh_error, fetched_at, event_count, updated_at
    FROM public.community_events_cache WHERE id = 1
$$;

REVOKE ALL ON FUNCTION public.get_community_events_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_events_health() TO authenticated;

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin)
VALUES
  ('community-events-sync', 1, 'EVENTS-SYNC-001', 'Cache populates from kicker',
   E'Feature: Community events sync\n  Scenario: Cache populates within 30s when secrets are present\n    Given vault has supabase_url and service_role_key\n    When public.kick_community_events_refresh() runs\n    Then [DB] community_events_cache.event_count > 0 and last_refresh_status = ''ok''\n    And [Code] GET /functions/v1/get-community-events returns 200 with non-empty events array\n    And [UI] /events renders event cards instead of the empty state'),
  ('community-events-sync', 1, 'EVENTS-SYNC-002', 'Visible failure when secrets missing',
   E'Feature: Community events sync\n  Scenario: Kicker records config_error when vault secrets are missing\n    Given vault is missing both supabase_url and project_url\n    When public.kick_community_events_refresh() runs\n    Then [DB] community_events_cache.last_refresh_status = ''config_error'' and last_refresh_error is non-null\n    And [Code] GET /functions/v1/get-community-events still returns 200 with empty events (graceful)\n    And [UI] admins see a red sync-failure banner on /events; non-admins see the friendly empty state')
ON CONFLICT (scenario_id) DO NOTHING;
