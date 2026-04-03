
-- Add logo_url column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';

-- Create client-logos storage bucket (public for display)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Admins can upload/update/delete client logos
CREATE POLICY "Admins can upload client logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update client logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'client-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete client logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Anyone can view client logos (public bucket)
CREATE POLICY "Anyone can view client logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'client-logos');
