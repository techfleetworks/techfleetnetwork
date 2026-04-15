
DROP VIEW IF EXISTS public.project_roster_member_view;

CREATE VIEW public.project_roster_member_view
WITH (security_invoker = on)
AS
SELECT
  pr.id,
  pr.airtable_record_id,
  pr.member_name,
  pr.member_email,
  pr.member_role,
  pr.project_name,
  pr.client_name,
  pr.phase,
  pr.project_type,
  pr.status,
  pr.start_date,
  pr.end_date,
  pr.linked_project_ids,
  pr.project_id,
  pr.synced_at,
  pr.created_at,
  pr.updated_at
FROM public.project_roster pr;
