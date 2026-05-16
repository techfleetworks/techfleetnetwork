
-- Track 4: RUM browser breakdown
ALTER TABLE public.web_vital_samples
  ADD COLUMN IF NOT EXISTS browser_name text,
  ADD COLUMN IF NOT EXISTS browser_major integer,
  ADD COLUMN IF NOT EXISTS os_name text,
  ADD COLUMN IF NOT EXISTS os_major integer,
  ADD COLUMN IF NOT EXISTS device_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'web_vital_samples_device_type_chk'
  ) THEN
    ALTER TABLE public.web_vital_samples
      ADD CONSTRAINT web_vital_samples_device_type_chk
      CHECK (device_type IS NULL OR device_type IN ('desktop','mobile','tablet','bot','unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS web_vital_samples_browser_idx
  ON public.web_vital_samples (metric_name, browser_name, created_at DESC);

-- p75/p95 by browser × device_type × metric
CREATE OR REPLACE FUNCTION public.web_vitals_p75_by_browser(p_window_hours integer DEFAULT 24)
RETURNS TABLE (
  browser_name text,
  os_name text,
  device_type text,
  metric_name text,
  sample_count bigint,
  p75 double precision,
  p95 double precision,
  good_pct double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT *
    FROM public.web_vital_samples
    WHERE created_at >= now() - make_interval(hours => GREATEST(1, LEAST(p_window_hours, 720)))
      AND has_role(auth.uid(), 'admin'::app_role)
  )
  SELECT
    COALESCE(browser_name,'unknown') AS browser_name,
    COALESCE(os_name,'unknown') AS os_name,
    COALESCE(device_type,'unknown') AS device_type,
    metric_name,
    COUNT(*)::bigint AS sample_count,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value)::double precision AS p75,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value)::double precision AS p95,
    (100.0 * SUM((rating = 'good')::int)::numeric / NULLIF(COUNT(*),0))::double precision AS good_pct
  FROM win
  GROUP BY 1,2,3,4
  HAVING COUNT(*) >= 10
  ORDER BY 1,2,3,4;
$$;

REVOKE ALL ON FUNCTION public.web_vitals_p75_by_browser(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_vitals_p75_by_browser(integer) TO authenticated;

-- Drill-down: p75 by route × browser
CREATE OR REPLACE FUNCTION public.web_vitals_p75_by_route_browser(
  p_window_hours integer DEFAULT 24,
  p_route text DEFAULT NULL
)
RETURNS TABLE (
  route text,
  browser_name text,
  device_type text,
  metric_name text,
  sample_count bigint,
  p75 double precision,
  p95 double precision,
  good_pct double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT *
    FROM public.web_vital_samples
    WHERE created_at >= now() - make_interval(hours => GREATEST(1, LEAST(p_window_hours, 720)))
      AND (p_route IS NULL OR route = p_route)
      AND has_role(auth.uid(), 'admin'::app_role)
  )
  SELECT
    route,
    COALESCE(browser_name,'unknown') AS browser_name,
    COALESCE(device_type,'unknown') AS device_type,
    metric_name,
    COUNT(*)::bigint AS sample_count,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value)::double precision AS p75,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value)::double precision AS p95,
    (100.0 * SUM((rating = 'good')::int)::numeric / NULLIF(COUNT(*),0))::double precision AS good_pct
  FROM win
  GROUP BY 1,2,3,4
  HAVING COUNT(*) >= 10
  ORDER BY 1,2,3,4;
$$;

REVOKE ALL ON FUNCTION public.web_vitals_p75_by_route_browser(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_vitals_p75_by_route_browser(integer, text) TO authenticated;
