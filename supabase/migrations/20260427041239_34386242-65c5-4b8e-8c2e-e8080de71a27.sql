CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_action text,
  p_max_attempts integer DEFAULT 5,
  p_window_minutes integer DEFAULT 1,
  p_block_minutes integer DEFAULT 5
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_record record;
  v_now timestamptz := now();
  v_lock_key bigint;
BEGIN
  IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 OR length(p_identifier) > 512 THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', 60);
  END IF;

  IF p_action IS NULL OR length(trim(p_action)) = 0 OR length(p_action) > 128 THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', 60);
  END IF;

  p_max_attempts := greatest(1, least(coalesce(p_max_attempts, 5), 100));
  p_window_minutes := greatest(1, least(coalesce(p_window_minutes, 1), 60));
  p_block_minutes := greatest(1, least(coalesce(p_block_minutes, 5), 1440));

  v_lock_key := hashtextextended(p_identifier || ':' || p_action, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_record
  FROM public.rate_limits
  WHERE identifier = p_identifier AND action = p_action
  ORDER BY window_start DESC
  LIMIT 1
  FOR UPDATE;

  IF v_record IS NOT NULL AND v_record.blocked_until IS NOT NULL THEN
    IF v_record.blocked_until > v_now THEN
      RETURN json_build_object(
        'allowed', false,
        'remaining', 0,
        'retry_after', extract(epoch from (v_record.blocked_until - v_now))::int
      );
    ELSE
      DELETE FROM public.rate_limits WHERE id = v_record.id;
      v_record := NULL;
    END IF;
  END IF;

  IF v_record IS NOT NULL AND v_record.window_start < v_now - (p_window_minutes || ' minutes')::interval THEN
    DELETE FROM public.rate_limits WHERE id = v_record.id;
    v_record := NULL;
  END IF;

  IF v_record IS NULL THEN
    INSERT INTO public.rate_limits (identifier, action, attempt_count, window_start)
    VALUES (p_identifier, p_action, 1, v_now);
    RETURN json_build_object('allowed', true, 'remaining', p_max_attempts - 1, 'retry_after', 0);
  END IF;

  UPDATE public.rate_limits
  SET attempt_count = v_record.attempt_count + 1,
      blocked_until = CASE
        WHEN v_record.attempt_count + 1 > p_max_attempts
        THEN v_now + (p_block_minutes || ' minutes')::interval
        ELSE NULL
      END
  WHERE id = v_record.id;

  IF v_record.attempt_count + 1 > p_max_attempts THEN
    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', p_block_minutes * 60
    );
  END IF;

  RETURN json_build_object(
    'allowed', true,
    'remaining', greatest(0, p_max_attempts - (v_record.attempt_count + 1)),
    'retry_after', 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.drain_notification_fanout_jobs(
  p_job_limit integer DEFAULT 5,
  p_max_chunks_per_job integer DEFAULT 20,
  p_chunk_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_chunks integer;
  v_result jsonb;
  v_summary jsonb := '[]'::jsonb;
BEGIN
  p_job_limit := greatest(1, least(coalesce(p_job_limit, 5), 25));
  p_max_chunks_per_job := greatest(1, least(coalesce(p_max_chunks_per_job, 20), 100));
  p_chunk_size := greatest(1, least(coalesce(p_chunk_size, 500), 1000));

  FOR v_job IN
    SELECT id
    FROM public.notification_fanout_jobs
    WHERE status IN ('pending', 'running')
    ORDER BY created_at
    LIMIT p_job_limit
  LOOP
    v_chunks := 0;
    LOOP
      EXIT WHEN v_chunks >= p_max_chunks_per_job;
      v_result := public.process_notification_fanout_chunk(v_job.id, p_chunk_size);
      v_chunks := v_chunks + 1;

      IF coalesce((v_result->>'done')::boolean, false) THEN
        EXIT;
      END IF;
    END LOOP;

    v_summary := v_summary || jsonb_build_array(
      jsonb_build_object(
        'job_id', v_job.id,
        'chunks', v_chunks,
        'last_result', coalesce(v_result, '{}'::jsonb)
      )
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', v_summary);
END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-notification-fanout-jobs') THEN
    PERFORM cron.unschedule('drain-notification-fanout-jobs');
  END IF;
END $$;

SELECT cron.schedule(
  'drain-notification-fanout-jobs',
  '* * * * *',
  'SELECT public.drain_notification_fanout_jobs(5, 20, 500);'
);