
-- 1. admin_promotions: scope SELECT so users only see their own row
DROP POLICY IF EXISTS "Admins can view promotions" ON public.admin_promotions;

CREATE POLICY "Admins can view all promotions"
ON public.admin_promotions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own promotion"
ON public.admin_promotions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2. bdd_scenarios: restrict to admins only
DROP POLICY IF EXISTS "Authenticated users can view scenarios" ON public.bdd_scenarios;

CREATE POLICY "Admins can view scenarios"
ON public.bdd_scenarios
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
