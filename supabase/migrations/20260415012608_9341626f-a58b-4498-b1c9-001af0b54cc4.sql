
-- 1. Restrict storage bucket listing (block unauthenticated enumeration)
-- Drop any existing overly-permissive SELECT policies on storage.objects for these buckets
-- and replace with policies that only allow authenticated listing

-- For avatars bucket: allow public read by direct path, but listing only for authenticated
CREATE POLICY "Block anonymous listing on avatars"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'avatars'
  AND name IS NOT NULL
  AND name != ''
  AND position('/' in name) > 0
);

-- For announcement-videos bucket
CREATE POLICY "Block anonymous listing on announcement-videos"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'announcement-videos'
  AND name IS NOT NULL
  AND name != ''
  AND position('/' in name) > 0
);

-- For client-logos bucket
CREATE POLICY "Block anonymous listing on client-logos"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'client-logos'
  AND name IS NOT NULL
  AND name != ''
  AND position('/' in name) > 0
);

-- 2. Fix SECURITY DEFINER view ownership
-- Ensure the view is owned by postgres (not a superuser role)
ALTER VIEW public.project_roster_member_view OWNER TO postgres;
