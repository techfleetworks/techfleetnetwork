
-- 1. Expand membership_tier enum
-- Postgres can't drop enum values in use, so we rename the old type and create a new one
ALTER TYPE public.membership_tier RENAME TO membership_tier_old;

CREATE TYPE public.membership_tier AS ENUM ('starter', 'community', 'professional');

-- Migrate the profiles column: free -> starter, paid -> community
ALTER TABLE public.profiles
  ALTER COLUMN membership_tier DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN membership_tier TYPE public.membership_tier
  USING (
    CASE membership_tier::text
      WHEN 'free' THEN 'starter'::public.membership_tier
      WHEN 'paid' THEN 'community'::public.membership_tier
      ELSE 'starter'::public.membership_tier
    END
  );

ALTER TABLE public.profiles
  ALTER COLUMN membership_tier SET DEFAULT 'starter'::public.membership_tier;

DROP TYPE public.membership_tier_old;

-- 2. Add membership tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founding_member boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS membership_sku text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS membership_gumroad_sale_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS membership_updated_at timestamptz;

-- 3. Create gumroad_sales audit/idempotency table
CREATE TABLE IF NOT EXISTS public.gumroad_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id text NOT NULL UNIQUE,
  seller_id text NOT NULL DEFAULT '',
  product_id text NOT NULL DEFAULT '',
  product_permalink text NOT NULL DEFAULT '',
  email text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  recurrence text NOT NULL DEFAULT '',
  resolved_tier public.membership_tier,
  resolved_user_id uuid,
  is_founding_member boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gumroad_sales_email ON public.gumroad_sales (lower(email));
CREATE INDEX IF NOT EXISTS idx_gumroad_sales_user_id ON public.gumroad_sales (resolved_user_id);
CREATE INDEX IF NOT EXISTS idx_gumroad_sales_received_at ON public.gumroad_sales (received_at DESC);

ALTER TABLE public.gumroad_sales ENABLE ROW LEVEL SECURITY;

-- Only admins can read; only service role writes
CREATE POLICY "Admins can view all gumroad sales"
  ON public.gumroad_sales
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Service role manages gumroad sales"
  ON public.gumroad_sales
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Enable realtime on profiles so the membership UI updates live
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END $$;
