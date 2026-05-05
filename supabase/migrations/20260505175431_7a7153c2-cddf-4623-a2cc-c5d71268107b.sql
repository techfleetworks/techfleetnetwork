
-- LCL-RL-001: Split rate-limit check into peek (read-only) + record (failure-only).
-- Prevents successful logins from incrementing the failure counter, which was
-- causing legitimate users to hit "too many attempts" after a single retry
-- when prior successful logins in the same 15-minute window had already
-- consumed bucket slots.

CREATE OR REPLACE FUNCTION public.peek_rate_limit(
  p_identifier text,
  p_action text,
  p_max_attempts integer DEFAULT 5,
  p_window_minutes integer DEFAULT 15,
  p_block_minutes integer DEFAULT 60
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_record record;
  v_now timestamptz := now();
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
  v_action text := lower(trim(coalesce(p_action, '')));
BEGIN
  IF v_identifier !~ '^[a-f0-9]{64}$' THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', 60);
  END IF;
  IF v_action NOT IN ('login_attempt', 'signup_attempt', 'password_reset') THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'retry_after', 60);
  END IF;

  p_max_attempts := CASE
    WHEN v_action = 'login_attempt' THEN least(greatest(coalesce(p_max_attempts, 6), 1), 10)
    ELSE least(greatest(coalesce(p_max_attempts, 3), 1), 5)
  END;

  SELECT * INTO v_record
  FROM public.rate_limits
  WHERE identifier = v_identifier AND action = v_action
  ORDER BY window_start DESC
  LIMIT 1;

  IF v_record IS NULL THEN
    RETURN json_build_object('allowed', true, 'remaining', p_max_attempts, 'retry_after', 0);
  END IF;

  IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', extract(epoch from (v_record.blocked_until - v_now))::int
    );
  END IF;

  RETURN json_build_object(
    'allowed', true,
    'remaining', greatest(0, p_max_attempts - v_record.attempt_count),
    'retry_after', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_rate_limit_failure(
  p_identifier text,
  p_action text,
  p_max_attempts integer DEFAULT 5,
  p_window_minutes integer DEFAULT 15,
  p_block_minutes integer DEFAULT 60
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  -- Reuse the existing increment logic; semantics are identical to the
  -- previous check_rate_limit call but only invoked on confirmed failures.
  RETURN public.check_rate_limit(p_identifier, p_action, p_max_attempts, p_window_minutes, p_block_minutes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_rate_limit(text, text, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rate_limit_failure(text, text, integer, integer, integer) TO anon, authenticated;
