
-- Recreate view with security_invoker = true
CREATE OR REPLACE VIEW public.project_roster_member_view
WITH (security_invoker = true)
AS
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
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    pr.member_email = (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    AND (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) <> ''
  );
