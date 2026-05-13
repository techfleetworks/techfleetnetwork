
DROP POLICY IF EXISTS "Authenticated read audit policy" ON public.audit_event_policy;

CREATE POLICY "Admins read audit policy"
ON public.audit_event_policy
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
