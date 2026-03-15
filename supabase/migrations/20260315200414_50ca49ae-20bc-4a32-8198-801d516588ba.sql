
CREATE OR REPLACE FUNCTION public.get_member_country_distribution()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    json_agg(json_build_object('country', country, 'count', cnt)),
    '[]'::json
  )
  FROM (
    SELECT country, count(*)::int AS cnt
    FROM public.profiles
    WHERE country IS NOT NULL AND country != ''
    GROUP BY country
    ORDER BY cnt DESC
  ) sub;
$$;
