-- 1. Fix project_roster: remove overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view roster" ON public.project_roster;

-- 2. Add scoped SELECT policy: users can only see their own roster entries
CREATE POLICY "Users can view own roster entries"
ON public.project_roster
FOR SELECT
TO authenticated
USING (
  member_email = (
    SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
  )
);

-- 3. Remove announcements from Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.announcements;
  END IF;
END
$$;