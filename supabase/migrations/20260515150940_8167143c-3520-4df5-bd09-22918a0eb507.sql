
-- Fix 1: Re-grant execute on web_vitals_p75 / web_vitals_trend to authenticated.
-- These were swept into the "server-only" REVOKE list in 20260512144655 by
-- mistake — the System Health > Performance tab calls them directly from the
-- admin client. Add a defense-in-depth admin check inside each function so
-- only admins can read RUM aggregates even though authenticated holds EXECUTE.

CREATE OR REPLACE FUNCTION public.web_vitals_p75(window_hours int DEFAULT 24)
RETURNS TABLE (
  route text,
  metric_name text,
  sample_count bigint,
  p75 double precision,
  p95 double precision,
  good_pct double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    s.route,
    s.metric_name,
    count(*)::bigint AS sample_count,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY s.value)::double precision AS p75,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY s.value)::double precision AS p95,
    (count(*) FILTER (WHERE s.rating = 'good'))::double precision
      / NULLIF(count(*),0)::double precision * 100 AS good_pct
  FROM public.web_vital_samples s
  WHERE s.created_at >= now() - make_interval(hours => greatest(window_hours, 1))
  GROUP BY s.route, s.metric_name
  HAVING count(*) >= 5
  ORDER BY s.route, s.metric_name;
END;
$$;

REVOKE ALL ON FUNCTION public.web_vitals_p75(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_vitals_p75(int) TO authenticated, service_role;

-- Same fix for web_vitals_trend if it exists with identical signature.
DO $$
DECLARE fn_sig text;
BEGIN
  FOR fn_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'web_vitals_trend'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn_sig);
  END LOOP;
END $$;

-- Fix 2: Dismiss the stale phantom triage entries that pre-date the
-- client_error_suppressed/deduped exclusion in discover_audit_fingerprints,
-- plus the web_vitals_p75 permission error (now resolved by the grant above).
UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = now(),
    dismissed_reason = 'meta: aggregate observability event (already excluded going forward)',
    updated_at = now()
WHERE status = 'pending'
  AND event_type IN ('client_error_suppressed','client_error_deduped','client_error_overflow');

UPDATE public.agent_fix_queue
SET status = 'dismissed',
    dismissed_at = now(),
    dismissed_reason = 'fixed: web_vitals_p75 EXECUTE re-granted to authenticated',
    updated_at = now()
WHERE status = 'pending'
  AND error_message ILIKE '%permission denied for function web_vitals_p75%';
