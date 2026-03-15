import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
  const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");

  if (!BOT_TOKEN || !GUILD_ID) {
    return new Response(
      JSON.stringify({ error: "Discord bot not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { discord_username } = await req.json();
    if (!discord_username) {
      return new Response(
        JSON.stringify({ error: "discord_username is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean up the username (remove @ prefix if present)
    const cleanUsername = discord_username.replace(/^@/, "").toLowerCase();

    // Search guild members by username
    console.log(`Using GUILD_ID: "${GUILD_ID}" (length: ${GUILD_ID.length})`);
    const searchUrl = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(cleanUsername)}&limit=10`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Discord API error [${res.status}]: ${errorText}`);
      return new Response(
        JSON.stringify({ error: "Failed to search Discord members", discord_user_id: null }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const members = await res.json();

    // Find exact match by username
    const match = members.find(
      (m: any) => m.user?.username?.toLowerCase() === cleanUsername
    );

    if (match) {
      return new Response(
        JSON.stringify({ discord_user_id: match.user.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ discord_user_id: null, message: "User not found in server" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Resolve Discord ID error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
