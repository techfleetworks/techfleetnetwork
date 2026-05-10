-- community_events_cache: single-row JSONB cache fed by a cron worker.
CREATE TABLE IF NOT EXISTS public.community_events_cache (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  events          JSONB    NOT NULL DEFAULT '[]'::jsonb,
  event_count     INTEGER  NOT NULL DEFAULT 0,
  etag            TEXT,
  last_modified   TEXT,
  fetched_at      TIMESTAMPTZ,
  last_refresh_status TEXT,
  last_refresh_error  TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.community_events_cache (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.community_events_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_events_cache_read ON public.community_events_cache;
CREATE POLICY community_events_cache_read
  ON public.community_events_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.kick_community_events_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_net
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

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
  NULL;
END;$$;

COMMENT ON FUNCTION public.kick_community_events_refresh IS
  'Calls /functions/v1/refresh-community-events via pg_net. Used by cron.';

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