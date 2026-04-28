CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_discord_username_unique
ON public.profiles (lower(discord_username))
WHERE discord_username IS NOT NULL AND discord_username <> '';