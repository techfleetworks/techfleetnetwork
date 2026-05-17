
CREATE TABLE IF NOT EXISTS public.discord_guild_stats (
  guild_id TEXT PRIMARY KEY,
  member_count INTEGER NOT NULL DEFAULT 0,
  presence_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_guild_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Discord guild stats are publicly readable"
  ON public.discord_guild_stats
  FOR SELECT
  USING (true);

DROP TRIGGER IF EXISTS update_discord_guild_stats_updated_at ON public.discord_guild_stats;
CREATE TRIGGER update_discord_guild_stats_updated_at
  BEFORE UPDATE ON public.discord_guild_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
