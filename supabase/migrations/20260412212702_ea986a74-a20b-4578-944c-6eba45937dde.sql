-- Drop the insecure email-based roster policy
DROP POLICY IF EXISTS "Users can view own roster entries" ON public.project_roster;

-- Create a secure replacement that joins on auth.uid() -> profiles.user_id
-- This prevents spoofing because profiles.user_id cannot be changed by the user
CREATE POLICY "Users can view own roster entries"
ON public.project_roster
FOR SELECT
TO authenticated
USING (
  member_email = (
    SELECT p.email
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
  AND (
    SELECT p.email
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  ) != ''
);

-- Also lock down the profiles email field more tightly:
-- Ensure the prevent_email_change trigger exists
DROP TRIGGER IF EXISTS prevent_email_change_trigger ON public.profiles;
CREATE TRIGGER prevent_email_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_email_change();