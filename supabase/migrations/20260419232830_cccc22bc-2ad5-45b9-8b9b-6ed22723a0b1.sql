
CREATE POLICY "Admins can view signup confirmation reminders"
ON public.signup_confirmation_reminders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
