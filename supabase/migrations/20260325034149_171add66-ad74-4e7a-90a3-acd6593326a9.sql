-- Trigger function: on new notification, call send-push-notification edge function via pg_net
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_payload jsonb;
  v_supabase_url text;
  v_service_key text;
BEGIN
  -- Read connection info from vault or app settings
  SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  -- Fallback to app.settings if vault is empty
  IF v_supabase_url IS NULL THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  END IF;
  IF v_service_key IS NULL THEN
    v_service_key := current_setting('app.settings.service_role_key', true);
  END IF;

  -- Skip if we can't resolve connection info
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- For each push subscription of the target user, fire a push
  FOR v_sub IN
    SELECT endpoint, p256dh, auth
    FROM public.push_subscriptions
    WHERE user_id = NEW.user_id
  LOOP
    v_payload := jsonb_build_object(
      'endpoint', v_sub.endpoint,
      'keys', jsonb_build_object('p256dh', v_sub.p256dh, 'auth', v_sub.auth),
      'title', NEW.title,
      'body', LEFT(regexp_replace(NEW.body_html, '<[^>]+>', '', 'g'), 200),
      'url', NEW.link_url,
      'notification_type', NEW.notification_type
    );

    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := v_payload
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_notification_inserted_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();