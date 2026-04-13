-- Drop the user SELECT policy that exposes the token column
DROP POLICY IF EXISTS "Users can view own promotion" ON public.admin_promotions;