
-- Track which announcements each user has read
CREATE TABLE public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, announcement_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Users can view their own reads
CREATE POLICY "Users can view own reads"
  ON public.announcement_reads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own reads
CREATE POLICY "Users can insert own reads"
  ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_announcement_reads_user ON public.announcement_reads (user_id, announcement_id);
