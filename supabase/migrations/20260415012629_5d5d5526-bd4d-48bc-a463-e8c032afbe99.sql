
-- Drop the overly broad public SELECT policies
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view announcement videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view client logos" ON storage.objects;

-- Drop the intermediate block policies (no longer needed)
DROP POLICY IF EXISTS "Block anonymous listing on avatars" ON storage.objects;
DROP POLICY IF EXISTS "Block anonymous listing on announcement-videos" ON storage.objects;
DROP POLICY IF EXISTS "Block anonymous listing on client-logos" ON storage.objects;

-- Authenticated users can view all files in these buckets
CREATE POLICY "Authenticated can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated can view announcement videos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'announcement-videos');

CREATE POLICY "Authenticated can view client logos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-logos');
