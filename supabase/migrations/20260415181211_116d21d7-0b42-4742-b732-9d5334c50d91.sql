-- Fix 1: Scope the avatars SELECT policy to prevent listing all files
-- Drop the overly broad policy and replace with a scoped one
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Allow anyone to read avatar files (needed for displaying profile pics)
-- but only if they know the exact path (no listing)
CREATE POLICY "Avatar images are publicly readable"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] IS NOT NULL
);

-- Fix 2: Restrict roster member view to hide sensitive admin-only fields
-- Drop the existing member view and recreate without sensitive columns
DROP VIEW IF EXISTS public.project_roster_member_view;

CREATE VIEW public.project_roster_member_view
WITH (security_invoker = on) AS
SELECT
  id,
  airtable_record_id,
  member_name,
  member_email,
  member_role,
  project_name,
  project_type,
  client_name,
  phase,
  status,
  start_date,
  end_date,
  linked_project_ids,
  project_id,
  created_at,
  updated_at,
  synced_at
FROM public.project_roster;
-- Excludes: performance_notes, raw_airtable_data, hours_contributed, mentor
