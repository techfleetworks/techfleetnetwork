DROP POLICY IF EXISTS blasts_admin_coord_select ON public.project_blasts;
CREATE POLICY blasts_admin_select ON public.project_blasts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));