-- 1) Stop broadcasting project_blasts row changes to all authenticated subscribers.
ALTER PUBLICATION supabase_realtime DROP TABLE public.project_blasts;

-- 2) Avatars bucket: drop the anon/public SELECT policy. The
-- "Avatars are viewable by signed-in users (no list)" policy remains and
-- covers all in-app rendering. Admins keep full access via "Admins can manage avatars".
DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;