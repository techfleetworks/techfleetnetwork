
-- Drop broad SELECT policies that allow listing on public buckets
-- Public bucket URLs still work without these policies

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view announcement videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view client logos" ON storage.objects;

-- Also check for any generic "allow all" SELECT policies
-- by recreating narrower upload/manage policies only (no SELECT needed for public buckets)
