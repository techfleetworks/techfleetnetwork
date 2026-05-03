
-- 1) Improved ranking for search_framework
CREATE OR REPLACE FUNCTION public.search_framework(p_query text, p_limit integer DEFAULT 10)
RETURNS TABLE(entity_type text, id uuid, slug text, name text, snippet text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q AS (SELECT lower(coalesce(p_query, '')) AS qn, coalesce(p_query, '') AS qr)
  SELECT v.entity_type, v.id, v.slug, v.name, left(v.description, 240) AS snippet
  FROM public.framework_entity_v v, q
  WHERE v.is_active
    AND (
      lower(v.name) LIKE '%' || q.qn || '%'
      OR lower(v.description) LIKE '%' || q.qn || '%'
      OR similarity(v.name, q.qr) > 0.15
    )
  ORDER BY
    GREATEST(
      similarity(v.name, q.qr),
      similarity(coalesce(v.description, ''), q.qr) * 0.5,
      CASE WHEN lower(v.name) = q.qn THEN 1.0
           WHEN lower(v.name) LIKE q.qn || '%' THEN 0.8
           WHEN lower(v.name) LIKE '%' || q.qn || '%' THEN 0.6
           ELSE 0 END
    ) DESC NULLS LAST,
    length(v.name) ASC
  LIMIT GREATEST(1, LEAST(50, COALESCE(p_limit, 10)));
$function$;

-- 2) Drop dead helpers (only referenced in old migrations, not at runtime)
DROP FUNCTION IF EXISTS public.fw_label(text);
DROP FUNCTION IF EXISTS public.fw_table(text);
