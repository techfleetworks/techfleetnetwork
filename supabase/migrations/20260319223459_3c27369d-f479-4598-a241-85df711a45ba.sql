
-- Add audio_url column to announcements (mutually exclusive with video_url at app level)
ALTER TABLE public.announcements
  ADD COLUMN audio_url text DEFAULT NULL;

-- RLS for audio files reuses the announcement-videos bucket (rename would break existing data)
-- We'll store audio in the same bucket since RLS policies already cover it
