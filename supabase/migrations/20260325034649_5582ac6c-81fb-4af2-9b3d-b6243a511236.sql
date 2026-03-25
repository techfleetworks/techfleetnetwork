CREATE OR REPLACE FUNCTION public.get_member_country_distribution()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    json_agg(json_build_object('country', COALESCE(NULLIF(country, ''), 'Not specified'), 'count', cnt)),
    '[]'::json
  )
  FROM (
    SELECT country, count(*)::int AS cnt
    FROM public.profiles
    GROUP BY country
    ORDER BY cnt DESC
  ) sub;
$function$;