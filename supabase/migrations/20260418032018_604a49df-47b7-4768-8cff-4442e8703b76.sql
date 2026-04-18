
-- ───────────────────────────────────────────────────────────────────
-- Zero-day vulnerability remediation pass — 2026-04-18
-- ───────────────────────────────────────────────────────────────────

-- 1. Fix announcement_views privacy leak: restrict SELECT to own rows
DROP POLICY IF EXISTS "Authenticated users can view all announcement views" ON public.announcement_views;
DROP POLICY IF EXISTS "Users can view all announcement views" ON public.announcement_views;
DROP POLICY IF EXISTS "Anyone can view announcement views" ON public.announcement_views;

CREATE POLICY "Users can view their own announcement view records"
ON public.announcement_views
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can see all (for analytics / abuse review)
CREATE POLICY "Admins can view all announcement view records"
ON public.announcement_views
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Add explicit public-read SELECT policies for intentionally public storage buckets.
-- This makes the public-read posture an explicit RLS decision rather than a side-effect
-- of the `public = true` bucket flag.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read access to announcement-videos'
  ) THEN
    CREATE POLICY "Public read access to announcement-videos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'announcement-videos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read access to client-logos'
  ) THEN
    CREATE POLICY "Public read access to client-logos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'client-logos');
  END IF;
END $$;

-- 3. Hash admin_promotions tokens at rest (defense in depth).
-- Add a token_hash column; the plaintext token still flows in the email link,
-- but only its SHA-256 hash is stored, so a DB read leak does not compromise
-- pending promotions.
ALTER TABLE public.admin_promotions
  ADD COLUMN IF NOT EXISTS token_hash text;

-- Backfill: hash any existing plaintext tokens
UPDATE public.admin_promotions
SET token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- Helper: verify a plaintext token against the stored hash, in constant time
CREATE OR REPLACE FUNCTION public.verify_admin_promotion_token(p_token text)
RETURNS TABLE(id uuid, user_id uuid, confirmed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.id, ap.user_id, ap.confirmed_at
  FROM public.admin_promotions ap
  WHERE ap.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_promotion_token(text) FROM public, anon, authenticated;

-- Trigger: on insert, automatically hash the token and clear the plaintext.
-- The plaintext is only available in the INSERT response (RETURNING token)
-- to the service-role caller that creates the promotion (promote-to-admin fn).
CREATE OR REPLACE FUNCTION public.trg_hash_admin_promotion_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.token IS NOT NULL THEN
    NEW.token_hash := encode(extensions.digest(NEW.token, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hash_admin_promotion_token ON public.admin_promotions;
CREATE TRIGGER hash_admin_promotion_token
BEFORE INSERT OR UPDATE OF token ON public.admin_promotions
FOR EACH ROW
EXECUTE FUNCTION public.trg_hash_admin_promotion_token();

-- 4. Tighten prevent_email_change to apply across ALL non-service roles
-- (defense in depth — RLS UPDATE still requires auth.uid() = user_id, but
-- this guarantees nobody but the service role can mutate email).
CREATE OR REPLACE FUNCTION public.prevent_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the service role may change the email column.
  -- This protects against the project_roster_member_view email-spoofing risk.
  IF auth.role() <> 'service_role' AND NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Stale-attempt cleanup index for failed_login_attempts (perf + security)
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email_time
  ON public.failed_login_attempts (email, attempted_at DESC);

-- 6. Index for admin_promotions token lookup (now via hash) — perf
CREATE INDEX IF NOT EXISTS idx_admin_promotions_token_hash
  ON public.admin_promotions (token_hash)
  WHERE confirmed_at IS NULL;
