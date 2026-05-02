-- 1) New columns on classes
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS why_take text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS audiences text NOT NULL DEFAULT '';

-- 2) Public bucket for class hero images
INSERT INTO storage.buckets (id, name, public)
VALUES ('class-hero-images', 'class-hero-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage policies (idempotent via DROP IF EXISTS)
DROP POLICY IF EXISTS "Class hero images are publicly viewable" ON storage.objects;
CREATE POLICY "Class hero images are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'class-hero-images');

DROP POLICY IF EXISTS "Teachers and admins can upload class hero images" ON storage.objects;
CREATE POLICY "Teachers and admins can upload class hero images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'class-hero-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'teacher'::app_role)
  )
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Teachers and admins can update class hero images" ON storage.objects;
CREATE POLICY "Teachers and admins can update class hero images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'class-hero-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "Teachers and admins can delete class hero images" ON storage.objects;
CREATE POLICY "Teachers and admins can delete class hero images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'class-hero-images'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);