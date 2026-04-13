
-- 1. Drop the non-admin SELECT policy on the base table
--    After this, only the admin ALL policy remains on project_roster
DROP POLICY IF EXISTS "Users can view own roster entries via view" ON public.project_roster;

-- 2. Recreate the view as security-definer (default) with built-in row filtering
--    This view runs as the owner, bypassing RLS on the base table,
--    but enforces its own access control via WHERE clause.
DROP VIEW IF EXISTS public.project_roster_member_view;

CREATE VIEW public.project_roster_member_view AS
SELECT
  pr.id,
  pr.airtable_record_id,
  pr.client_name,
  pr.created_at,
  pr.end_date,
  pr.linked_project_ids,
  pr.member_email,
  pr.member_name,
  pr.member_role,
  pr.phase,
  pr.project_id,
  pr.project_name,
  pr.project_type,
  pr.start_date,
  pr.status,
  pr.synced_at,
  pr.updated_at
FROM public.project_roster pr
WHERE
  (
    -- Admin path: admins see all rows
    public.has_role(auth.uid(), 'admin')
  )
  OR
  (
    -- Member path: only own rows, matched by non-empty email
    pr.member_email = (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    AND (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) <> ''
  );

-- Grant access to the view for authenticated users
GRANT SELECT ON public.project_roster_member_view TO authenticated;
