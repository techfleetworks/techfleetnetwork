-- Database-level safety net: periodic cleanup of stuck queue messages
-- This function can be called by pg_cron to forcibly DLQ messages
-- that have been read too many times (read_ct > threshold)
CREATE OR REPLACE FUNCTION public.cleanup_stuck_email_queue()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  v_queue text;
  v_msg record;
  v_dlq text;
  v_max_read_ct integer := 20;
BEGIN
  FOR v_queue IN SELECT unnest(ARRAY['auth_emails', 'transactional_emails'])
  LOOP
    v_dlq := v_queue || '_dlq';
    
    -- Find messages with excessive read counts using pgmq.read
    -- with a very short visibility timeout (1 second)
    FOR v_msg IN
      SELECT msg_id, read_ct, message
      FROM pgmq.read(v_queue, 1, 100)
      WHERE read_ct > v_max_read_ct
    LOOP
      -- Log as DLQ
      INSERT INTO public.email_send_log (
        message_id,
        template_name,
        recipient_email,
        status,
        error_message
      ) VALUES (
        COALESCE(v_msg.message->>'message_id', 'unknown-' || v_msg.msg_id::text),
        COALESCE(v_msg.message->>'label', v_queue),
        COALESCE(v_msg.message->>'to', 'unknown'),
        'dlq',
        format('DB cleanup: read_ct=%s exceeded threshold=%s', v_msg.read_ct, v_max_read_ct)
      );
      
      -- Move to DLQ
      PERFORM public.move_to_dlq(v_queue, v_dlq, v_msg.msg_id, v_msg.message);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Schedule cleanup every 10 minutes to catch anything the processor missed
SELECT cron.schedule(
  'cleanup-stuck-email-queue',
  '*/10 * * * *',
  $$SELECT public.cleanup_stuck_email_queue()$$
);
