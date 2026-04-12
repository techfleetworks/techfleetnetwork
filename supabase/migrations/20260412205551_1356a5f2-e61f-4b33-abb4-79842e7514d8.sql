-- Switch back to profile-based email lookup — now safe because
-- the prevent_profile_email_change trigger blocks users from
-- changing their own profile email
DROP POLICY IF EXISTS "Users can view own roster entries" ON public.project_roster;

CREATE POLICY "Users can view own roster entries"
ON public.project_roster
FOR SELECT TO authenticated
USING (
  member_email = (
    SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
  )
);