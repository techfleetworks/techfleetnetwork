-- Restore public read for announcement-videos bucket.
-- Stored announcements use direct public URLs (https://.../object/public/announcement-videos/...).
-- The bucket had been flipped to private and the public-read policy dropped, which
-- broke playback of all existing announcement videos ("Bucket not found").
UPDATE storage.buckets SET public = true WHERE id = 'announcement-videos';

DROP POLICY IF EXISTS "Public read access to announcement-videos" ON storage.objects;
CREATE POLICY "Public read access to announcement-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'announcement-videos');
