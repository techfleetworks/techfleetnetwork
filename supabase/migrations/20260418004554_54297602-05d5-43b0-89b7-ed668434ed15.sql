-- Track every click into an announcement (from Updates page or notification bell)
CREATE TABLE public.announcement_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcement_views_announcement_id ON public.announcement_views(announcement_id);
CREATE INDEX idx_announcement_views_user_id ON public.announcement_views(user_id);

ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated may read views (so counts are public to members)
CREATE POLICY "Authenticated users can view all announcement views"
  ON public.announcement_views
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert their own view records
CREATE POLICY "Users can insert own announcement views"
  ON public.announcement_views
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Aggregated counts function (returns total + unique per announcement)
CREATE OR REPLACE FUNCTION public.get_announcement_view_counts()
RETURNS TABLE (
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

GRANT EXECUTE ON FUNCTION public.get_announcement_view_counts() TO authenticated;