-- A01: Fix invitation token exposure - replace open SELECT with secure function
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can validate invitation by token" ON public.invitations;

-- Create a secure validation function that only returns one row by token
CREATE OR REPLACE FUNCTION public.validate_invitation(p_token text)
RETURNS TABLE(email text, expires_at timestamptz, used_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT i.email, i.expires_at, i.used_at
  FROM public.invitations i
  WHERE i.token = p_token
  LIMIT 1;
$$;

-- Create a secure function to mark invitation as used (only if not already used and not expired)
CREATE OR REPLACE FUNCTION public.use_invitation(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_used boolean;
BEGIN
  UPDATE public.invitations
  SET used_at = now()
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now();
  
  RETURN FOUND;
END;
$$;

-- Add unique constraint on journey_progress for upsert to work correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journey_progress_user_phase_task_unique'
  ) THEN
    ALTER TABLE public.journey_progress 
      ADD CONSTRAINT journey_progress_user_phase_task_unique 
      UNIQUE (user_id, phase, task_id);
  END IF;
END
$$;

-- A01: Ensure profiles RLS uses authenticated role, not public
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Authenticated users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Fix journey_progress RLS to use authenticated role
DROP POLICY IF EXISTS "Users can insert their own progress" ON public.journey_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON public.journey_progress;
DROP POLICY IF EXISTS "Users can view their own progress" ON public.journey_progress;

CREATE POLICY "Authenticated users can insert own progress"
  ON public.journey_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own progress"
  ON public.journey_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view own progress"
  ON public.journey_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);