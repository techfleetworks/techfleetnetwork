-- Allow all authenticated users to view projects with status 'apply_now'
CREATE POLICY "Authenticated users can view apply_now projects"
ON public.projects
FOR SELECT
TO authenticated
USING (project_status = 'apply_now');

-- Allow all authenticated users to view active clients (needed to display client name on openings)
CREATE POLICY "Authenticated users can view active clients"
ON public.clients
FOR SELECT
TO authenticated
USING (status = 'active');