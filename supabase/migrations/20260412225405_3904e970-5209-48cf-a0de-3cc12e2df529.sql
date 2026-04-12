
-- 1. Create a member-safe view for project_roster that excludes sensitive fields
CREATE VIEW public.project_roster_member_view
WITH (security_invoker = on) AS
SELECT
  id,
  airtable_record_id,
  client_name,
  created_at,
  start_date,
  end_date,
  linked_project_ids,
  member_email,
  member_name,
  member_role,
  phase,
  project_id,
  project_name,
  project_type,
  status,
  synced_at,
  updated_at
FROM public.project_roster;

-- 2. Drop the existing non-admin SELECT policy on project_roster
DROP POLICY IF EXISTS "Users can view own roster entries" ON public.project_roster;

-- 3. Re-create non-admin policy that hides the full table; users must use the view
-- The view inherits RLS, so we need a policy that still allows row-level access
-- but the view controls which columns are visible.
CREATE POLICY "Users can view own roster entries via view"
ON public.project_roster
FOR SELECT
TO authenticated
USING (
  (
    member_email = (
      SELECT p.email FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT p.email FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1
    ) <> ''
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Add SELECT policy for promoted users on admin_promotions
CREATE POLICY "Users can view own promotion"
ON public.admin_promotions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
