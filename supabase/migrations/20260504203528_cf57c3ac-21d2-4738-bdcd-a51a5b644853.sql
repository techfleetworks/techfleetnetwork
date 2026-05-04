CREATE OR REPLACE FUNCTION public.get_announcement_view_counts()
RETURNS TABLE(
  announcement_id uuid,
  total_views bigint,
  unique_views bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    announcement_id,
    count(*)::bigint AS total_views,
    count(DISTINCT user_id)::bigint AS unique_views
  FROM public.announcement_views
  GROUP BY announcement_id;
$$;

REVOKE ALL ON FUNCTION public.get_announcement_view_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_announcement_view_counts() TO authenticated;