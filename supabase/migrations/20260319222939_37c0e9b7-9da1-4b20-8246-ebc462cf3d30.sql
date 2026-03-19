
-- Add video_url column to announcements
ALTER TABLE public.announcements
  ADD COLUMN video_url text DEFAULT NULL;

-- Create storage bucket for announcement videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('announcement-videos', 'announcement-videos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow authenticated users to read videos
CREATE POLICY "Anyone can view announcement videos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'announcement-videos');

-- RLS: Only admins can upload videos
CREATE POLICY "Admins can upload announcement videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-videos'
    AND public.has_role(auth.uid(), 'admin')
  );

-- RLS: Only admins can delete videos
CREATE POLICY "Admins can delete announcement videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'announcement-videos'
    AND public.has_role(auth.uid(), 'admin')
  );
