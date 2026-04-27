CREATE OR REPLACE FUNCTION public.check_chat_system_rate_limit()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_record record;
  v_now timestamptz := now();
  v_identifier text := 'system:techfleet-chat';
  v_action text := 'chat_request';
  v_max_attempts integer := 30;
  v_window interval := interval '1 hour';
  v_retry_after integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(v_identifier || ':' || v_action, 0));

  DELETE FROM public.rate_limits
  WHERE action = v_action
    AND (
      identifier <> v_identifier
      OR window_start <= v_now - v_window
      OR (blocked_until IS NOT NULL AND blocked_until <= v_now)
    );

  SELECT * INTO v_record
  FROM public.rate_limits
  WHERE identifier = v_identifier
    AND action = v_action
  ORDER BY window_start DESC
  LIMIT 1
  FOR UPDATE;

  IF v_record IS NULL THEN
    INSERT INTO public.rate_limits (identifier, action, attempt_count, window_start, blocked_until)
    VALUES (v_identifier, v_action, 1, v_now, NULL);

    RETURN json_build_object(
      'allowed', true,
      'remaining', v_max_attempts - 1,
      'retry_after', 0,
      'limit', v_max_attempts,
      'window_seconds', 3600
    );
  END IF;

  v_retry_after := greatest(1, extract(epoch from ((v_record.window_start + v_window) - v_now))::int);

  IF v_record.attempt_count >= v_max_attempts THEN
    UPDATE public.rate_limits
    SET blocked_until = v_record.window_start + v_window
    WHERE id = v_record.id;

    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', v_retry_after,
      'limit', v_max_attempts,
      'window_seconds', 3600
    );
  END IF;

  UPDATE public.rate_limits
  SET attempt_count = v_record.attempt_count + 1,
      blocked_until = NULL
  WHERE id = v_record.id;

  RETURN json_build_object(
    'allowed', true,
    'remaining', greatest(0, v_max_attempts - (v_record.attempt_count + 1)),
    'retry_after', 0,
    'limit', v_max_attempts,
    'window_seconds', 3600
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.check_chat_system_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_chat_system_rate_limit() TO service_role;