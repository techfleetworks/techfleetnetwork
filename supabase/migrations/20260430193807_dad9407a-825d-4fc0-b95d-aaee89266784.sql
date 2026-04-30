-- Allow admins to update applicant_status (and other fields) on project_applications.
-- Members can still only update their own draft; admins can update any.
CREATE POLICY "Admins can update project applications"
ON public.project_applications
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Also allow admins to delete (mirrors clients/projects/announcements pattern, useful for spam cleanup).
CREATE POLICY "Admins can delete project applications"
ON public.project_applications
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));