-- 1. Fix CRITICAL: project_roster SELECT uses mutable email — switch to JWT email
DROP POLICY IF EXISTS "Users can view own roster entries" ON public.project_roster;

CREATE POLICY "Users can view own roster entries"
ON public.project_roster
FOR SELECT TO authenticated
USING (
  member_email = (auth.jwt()->>'email')
);

-- 2. Fix: Remove user-facing SELECT on admin_promotions that exposes token
-- Users should use get_own_promotions() function instead
DROP POLICY IF EXISTS "Users can view own promotion metadata" ON public.admin_promotions;

-- 3. Fix: Prevent users from changing their own email via profile updates
-- Email must be changed through auth.updateUser() which goes through Supabase Auth
CREATE OR REPLACE FUNCTION public.prevent_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the user is updating their own profile, prevent email changes
  -- Service role (admin operations) can still change email
  IF auth.role() = 'authenticated' AND NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_profile_email_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_email_change();