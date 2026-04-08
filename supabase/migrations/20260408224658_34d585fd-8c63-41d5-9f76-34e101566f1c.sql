CREATE POLICY "Users can delete own project applications"
ON public.project_applications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);