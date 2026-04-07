import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
  const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");
  const headers = { Authorization: `Bot ${BOT_TOKEN}` };

  const queries = ["kmorgan", "morgan", "km"];
  const results: Record<string, any> = {};

  for (const q of queries) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(q)}&limit=10`, { headers });
    const body = res.ok ? await res.json() : await res.text();
    results[q] = {
      status: res.status,
      count: Array.isArray(body) ? body.length : 0,
      members: Array.isArray(body) ? body.map((m: any) => ({ username: m.user?.username, global_name: m.user?.global_name, nick: m.nick, id: m.user?.id })) : body,
    };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
