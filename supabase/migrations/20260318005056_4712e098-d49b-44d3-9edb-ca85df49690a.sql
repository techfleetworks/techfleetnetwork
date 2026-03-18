-- Allow admins to view all general applications for the submission detail page
CREATE POLICY "Admins can view all general applications"
  ON public.general_applications
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));