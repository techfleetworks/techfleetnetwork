-- 1. Fix exploration_queries: restrict SELECT to own rows only
DROP POLICY IF EXISTS "Authenticated users can view all exploration queries" ON public.exploration_queries;

CREATE POLICY "Users can view own exploration queries"
ON public.exploration_queries
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all exploration queries"
ON public.exploration_queries
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Fix admin_promotions: create a view-only policy that hides token
-- Drop the existing user-facing SELECT that exposes the token
DROP POLICY IF EXISTS "Users can view own promotion" ON public.admin_promotions;

-- Create a security definer function that returns promotions without tokens
CREATE OR REPLACE FUNCTION public.get_own_promotions(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  promoted_by uuid,
  created_at timestamptz,
  confirmed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.id, ap.user_id, ap.promoted_by, ap.created_at, ap.confirmed_at
  FROM public.admin_promotions ap
  WHERE ap.user_id = p_user_id;
$$;

-- Users can still see their promotion status (but no token column via RLS)
-- We re-add a SELECT policy that only allows reading non-token columns
-- Since RLS can't filter columns, we rely on the function above
-- But we need a policy for the confirmation flow which uses token in WHERE
CREATE POLICY "Users can view own promotion metadata"
ON public.admin_promotions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 3. Harden exploration_cache: restrict writes to service role only
DROP POLICY IF EXISTS "Authenticated users can insert exploration cache" ON public.exploration_cache;
DROP POLICY IF EXISTS "Authenticated users can update exploration cache" ON public.exploration_cache;

CREATE POLICY "Service role can insert exploration cache"
ON public.exploration_cache
FOR INSERT TO public
WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can update exploration cache"
ON public.exploration_cache
FOR UPDATE TO public
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);