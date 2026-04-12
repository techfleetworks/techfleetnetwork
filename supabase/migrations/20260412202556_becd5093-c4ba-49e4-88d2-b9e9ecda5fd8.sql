
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert exploration cache" ON public.exploration_cache;
DROP POLICY IF EXISTS "Authenticated users can update exploration cache" ON public.exploration_cache;

-- Recreate with proper checks (auth.role() = 'authenticated')
CREATE POLICY "Authenticated users can insert exploration cache"
ON public.exploration_cache
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update exploration cache"
ON public.exploration_cache
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
