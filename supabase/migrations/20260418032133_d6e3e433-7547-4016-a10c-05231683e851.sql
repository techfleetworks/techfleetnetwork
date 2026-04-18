
-- Roll back the broad SELECT policies — they enable listing.
-- Public direct-URL reads still work because the bucket itself is `public = true`.
DROP POLICY IF EXISTS "Public read access to announcement-videos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to client-logos" ON storage.objects;
