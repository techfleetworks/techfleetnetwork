DROP POLICY IF EXISTS "Authenticated users can view apply_now projects" ON public.projects;

CREATE POLICY "Authenticated users can view non-complete projects"
ON public.projects
FOR SELECT
TO authenticated
USING (project_status != 'project_complete');