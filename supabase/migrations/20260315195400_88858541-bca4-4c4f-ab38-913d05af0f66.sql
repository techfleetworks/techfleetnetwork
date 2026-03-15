
-- Rate limiting table for brute-force protection (OWASP: Credential Stuffing, Brute Force)
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,          -- hashed IP or email
  action text NOT NULL,              -- 'login_attempt', 'signup_attempt', 'password_reset'
  attempt_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No RLS policies — accessed only via SECURITY DEFINER functions

-- Index for fast lookups
CREATE INDEX idx_rate_limits_identifier_action ON public.rate_limits (identifier, action);

-- Cleanup function for expired rate limit entries
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - interval '1 hour';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Check and increment rate limit (returns true if allowed, false if blocked)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_action text,
  p_max_attempts int DEFAULT 5,
  p_window_minutes int DEFAULT 15,
  p_block_minutes int DEFAULT 30
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_record record;
  v_now timestamptz := now();
BEGIN
  -- Check for existing rate limit record
  SELECT * INTO v_record
  FROM public.rate_limits
  WHERE identifier = p_identifier AND action = p_action
  ORDER BY window_start DESC
  LIMIT 1;

  -- If blocked, check if block has expired
  IF v_record IS NOT NULL AND v_record.blocked_until IS NOT NULL THEN
    IF v_record.blocked_until > v_now THEN
      RETURN json_build_object(
        'allowed', false,
        'remaining', 0,
        'retry_after', extract(epoch from (v_record.blocked_until - v_now))::int
      );
    ELSE
      -- Block expired, reset
      DELETE FROM public.rate_limits WHERE id = v_record.id;
      v_record := NULL;
    END IF;
  END IF;

  -- If window expired, reset
  IF v_record IS NOT NULL AND v_record.window_start < v_now - (p_window_minutes || ' minutes')::interval THEN
    DELETE FROM public.rate_limits WHERE id = v_record.id;
    v_record := NULL;
  END IF;

  -- No record or expired — create new
  IF v_record IS NULL THEN
    INSERT INTO public.rate_limits (identifier, action, attempt_count, window_start)
    VALUES (p_identifier, p_action, 1, v_now);
    RETURN json_build_object('allowed', true, 'remaining', p_max_attempts - 1, 'retry_after', 0);
  END IF;

  -- Increment attempt count
  UPDATE public.rate_limits
  SET attempt_count = v_record.attempt_count + 1,
      blocked_until = CASE
        WHEN v_record.attempt_count + 1 >= p_max_attempts
        THEN v_now + (p_block_minutes || ' minutes')::interval
        ELSE NULL
      END
  WHERE id = v_record.id;

  IF v_record.attempt_count + 1 >= p_max_attempts THEN
    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', p_block_minutes * 60
    );
  END IF;

  RETURN json_build_object(
    'allowed', true,
    'remaining', p_max_attempts - (v_record.attempt_count + 1),
    'retry_after', 0
  );
END;
$$;

-- Reset rate limit on successful action (e.g., successful login)
CREATE OR REPLACE FUNCTION public.reset_rate_limit(p_identifier text, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE identifier = p_identifier AND action = p_action;
END;
$$;
