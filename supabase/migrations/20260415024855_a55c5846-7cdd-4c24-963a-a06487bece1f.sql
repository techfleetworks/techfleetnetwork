
-- Add scoped SELECT policy so members can see their own roster entries
CREATE POLICY "Members can view own roster entries"
ON public.project_roster
FOR SELECT
TO authenticated
USING (
  member_email = (SELECT email FROM public.profiles WHERE user_id = auth.uid())
);
