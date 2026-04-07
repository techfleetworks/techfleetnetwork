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

  // 1. List first 10 members (doesn't use search)
  const listRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=10`, { headers });
  const listBody = listRes.ok ? await listRes.json() : await listRes.text();

  // 2. Search for "k"  
  const searchRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=k&limit=10`, { headers });
  const searchBody = searchRes.ok ? await searchRes.json() : await searchRes.text();

  // 3. Get guild info
  const guildRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}?with_counts=true`, { headers });
  const guildBody = guildRes.ok ? await guildRes.json() : await guildRes.text();

  const result = {
    guild: guildRes.ok ? { name: guildBody.name, member_count: guildBody.approximate_member_count, id: guildBody.id } : { error: listRes.status, body: guildBody },
    list_members: {
      status: listRes.status,
      count: Array.isArray(listBody) ? listBody.length : 0,
      usernames: Array.isArray(listBody) ? listBody.map((m: any) => ({ username: m.user?.username, global_name: m.user?.global_name, nick: m.nick, id: m.user?.id })) : listBody,
    },
    search_k: {
      status: searchRes.status,
      count: Array.isArray(searchBody) ? searchBody.length : 0,
      usernames: Array.isArray(searchBody) ? searchBody.map((m: any) => ({ username: m.user?.username, global_name: m.user?.global_name, nick: m.nick })) : searchBody,
    },
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
