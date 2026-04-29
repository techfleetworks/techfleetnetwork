-- Move elevated role-check internals out of the exposed API schema while preserving RLS recursion protection.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.has_role(_user_id, _role);
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Make announcement videos private so members-only announcements cannot be accessed through public URLs.
UPDATE storage.buckets
SET public = false
WHERE id = 'announcement-videos';

DROP POLICY IF EXISTS "Announcement videos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view announcement videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload announcement videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete announcement videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update announcement videos" ON storage.objects;

CREATE POLICY "Authenticated users can view announcement videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'announcement-videos');

CREATE POLICY "Admins can upload announcement videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'announcement-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update announcement videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'announcement-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'announcement-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete announcement videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'announcement-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);