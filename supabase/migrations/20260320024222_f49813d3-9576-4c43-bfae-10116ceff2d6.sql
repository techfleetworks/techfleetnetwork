
-- Add Discord invite tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_discord_account boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discord_invite_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discord_invite_created_at timestamptz;
