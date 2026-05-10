
DROP FUNCTION IF EXISTS public._diag_list_vault_names();

CREATE OR REPLACE FUNCTION public.kick_community_events_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_net
AS $$
DECLARE
  v_url TEXT := 'https://iqsjhrhsjlgjiaedzmtz.supabase.co';
  v_key TEXT;
  v_err TEXT;
BEGIN
  BEGIN
    -- Reuse the service-role key already provisioned for the email queue worker.
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
    IF v_key IS NULL THEN
      SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
    END IF;
    IF v_key IS NULL THEN
      SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF v_key IS NULL OR v_err IS NOT NULL THEN
    UPDATE public.community_events_cache
      SET last_refresh_status = 'config_error',
          last_refresh_error  = COALESCE(v_err, 'service-role key not available in vault'),
          updated_at          = now()
      WHERE id = 1;
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/refresh-community-events',
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

-- Kick immediately so this week's events appear within seconds.
SELECT public.kick_community_events_refresh();
