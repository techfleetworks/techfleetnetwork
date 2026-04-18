
-- Outbox table for guaranteed delivery
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  notification_type text NOT NULL DEFAULT 'general',
  link_url text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'unknown',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON public.notification_outbox (next_attempt_at)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_user
  ON public.notification_outbox (user_id, created_at DESC);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read outbox"
  ON public.notification_outbox FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Dead letter queue
CREATE TABLE IF NOT EXISTS public.notification_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  notification_type text NOT NULL DEFAULT 'general',
  link_url text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'unknown',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  failed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_dlq_failed_at
  ON public.notification_dlq (failed_at DESC);

ALTER TABLE public.notification_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read dlq"
  ON public.notification_dlq FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_notification_outbox_updated_at ON public.notification_outbox;
CREATE TRIGGER trg_notification_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Safe enqueue + immediate-attempt RPC
CREATE OR REPLACE FUNCTION public.safe_create_notification(
  p_user_id uuid,
  p_title text,
  p_body_html text DEFAULT '',
  p_notification_type text DEFAULT 'general',
  p_link_url text DEFAULT '',
  p_source text DEFAULT 'unknown'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox_id uuid;
  v_inserted_id uuid;
BEGIN
  -- Always enqueue first for durable record
  INSERT INTO public.notification_outbox (user_id, title, body_html, notification_type, link_url, source)
  VALUES (p_user_id, COALESCE(p_title,''), COALESCE(p_body_html,''),
          COALESCE(p_notification_type,'general'), COALESCE(p_link_url,''), COALESCE(p_source,'unknown'))
  RETURNING id INTO v_outbox_id;

  -- Try direct insert
  BEGIN
    INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
    VALUES (p_user_id, COALESCE(p_title,''), COALESCE(p_body_html,''),
            COALESCE(p_notification_type,'general'), COALESCE(p_link_url,''))
    RETURNING id INTO v_inserted_id;

    UPDATE public.notification_outbox
       SET delivered_at = now(), attempts = attempts + 1
     WHERE id = v_outbox_id;
  EXCEPTION WHEN OTHERS THEN
    -- Mark first failed attempt; worker will retry with backoff
    UPDATE public.notification_outbox
       SET attempts = attempts + 1,
           last_error = LEFT(SQLERRM, 1000),
           next_attempt_at = now() + interval '30 seconds'
     WHERE id = v_outbox_id;
    -- Audit failure (triggers admin alert via existing notify_admin_on_audit_error)
    BEGIN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, error_message, changed_fields)
      VALUES ('notification_insert_failed', 'notifications', v_outbox_id::text, p_user_id,
              LEFT(SQLERRM, 1000), ARRAY[COALESCE(p_source,'unknown'), COALESCE(p_notification_type,'general')]);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN v_outbox_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_create_notification(uuid,text,text,text,text,text) TO authenticated, service_role;

-- Background drain worker (called by pg_cron + edge function)
CREATE OR REPLACE FUNCTION public.drain_notification_outbox(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_delivered int := 0;
  v_failed int := 0;
  v_dlq int := 0;
  v_max_attempts int := 5;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.notification_outbox
    WHERE delivered_at IS NULL
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
      VALUES (v_row.user_id, v_row.title, v_row.body_html, v_row.notification_type, v_row.link_url);

      UPDATE public.notification_outbox
         SET delivered_at = now(), attempts = attempts + 1, last_error = NULL
       WHERE id = v_row.id;
      v_delivered := v_delivered + 1;
    EXCEPTION WHEN OTHERS THEN
      IF v_row.attempts + 1 >= v_max_attempts THEN
        -- Move to DLQ
        INSERT INTO public.notification_dlq (
          outbox_id, user_id, title, body_html, notification_type,
          link_url, source, attempts, last_error
        ) VALUES (
          v_row.id, v_row.user_id, v_row.title, v_row.body_html, v_row.notification_type,
          v_row.link_url, v_row.source, v_row.attempts + 1, LEFT(SQLERRM, 1000)
        );
        DELETE FROM public.notification_outbox WHERE id = v_row.id;
        v_dlq := v_dlq + 1;
        -- Audit DLQ event for admin alerting
        BEGIN
          INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, error_message, changed_fields)
          VALUES ('notification_dlq', 'notification_outbox', v_row.id::text, v_row.user_id,
                  LEFT(SQLERRM, 1000), ARRAY[v_row.source, v_row.notification_type]);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      ELSE
        -- Exponential backoff: 30s, 2m, 8m, 32m
        UPDATE public.notification_outbox
           SET attempts = attempts + 1,
               last_error = LEFT(SQLERRM, 1000),
               next_attempt_at = now() + (interval '30 seconds' * power(4, attempts))
         WHERE id = v_row.id;
        v_failed := v_failed + 1;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('delivered', v_delivered, 'retry_scheduled', v_failed, 'dlq', v_dlq);
END;
$$;

GRANT EXECUTE ON FUNCTION public.drain_notification_outbox(int) TO authenticated, service_role;

-- Schedule the drain every minute via pg_cron (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-notification-outbox') THEN
    PERFORM cron.unschedule('drain-notification-outbox');
  END IF;
  PERFORM cron.schedule(
    'drain-notification-outbox',
    '* * * * *',
    $cron$ SELECT public.drain_notification_outbox(500); $cron$
  );
END $$;
