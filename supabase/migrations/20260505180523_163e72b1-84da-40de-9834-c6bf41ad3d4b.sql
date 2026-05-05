DELETE FROM public.rate_limits
WHERE blocked_until IS NOT NULL
  AND blocked_until > now()
  AND action IN ('signup_attempt','login_attempt');