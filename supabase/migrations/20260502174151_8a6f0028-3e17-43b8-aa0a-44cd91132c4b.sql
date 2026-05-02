-- Allow admins to create classes and cohorts (parity with teachers)
CREATE POLICY "Admins can create classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create cohorts"
ON public.cohorts
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));