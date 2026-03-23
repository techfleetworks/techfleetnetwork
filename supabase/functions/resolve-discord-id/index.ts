import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("resolve-discord-id");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Max request body size (4 KB) */
const MAX_BODY_BYTES = 4 * 1024;
/** Max username length (Discord limit is 32) */
const MAX_USERNAME_LENGTH = 32;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Request received [${requestId}]`, { requestId });

  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
  const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");

  if (!BOT_TOKEN || !GUILD_ID) {
    log.error("config", `Discord bot not configured [${requestId}]: BOT_TOKEN=${!!BOT_TOKEN}, GUILD_ID=${!!GUILD_ID}`, { requestId });
    return new Response(
      JSON.stringify({ error: "Discord bot not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // A3: Enforce request body size limit
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "Request body too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { discord_username } = await req.json();
    if (!discord_username || typeof discord_username !== "string" || discord_username.length > MAX_USERNAME_LENGTH) {
      log.warn("validate", `Missing discord_username in request body [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ error: "discord_username is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanUsername = discord_username.replace(/^[@.]+/, "").toLowerCase();
    log.info("resolve", `Searching Discord guild for username "${cleanUsername}" [${requestId}]`, {
      requestId,
      username: cleanUsername,
      guildId: GUILD_ID,
    });

    const searchUrl = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(cleanUsername)}&limit=10`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    if (!res.ok) {
      const errorText = await res.text();
      log.error("resolve", `Discord API error [${requestId}]: HTTP ${res.status} — ${errorText}`, {
        requestId,
        httpStatus: res.status,
        username: cleanUsername,
        responseBody: errorText.substring(0, 500),
      });
      // For 404 (unknown guild) or 403 (bot lacks access), return a graceful null
      // so the client UI doesn't show a scary error — the user simply isn't found
      if (res.status === 404 || res.status === 403) {
        return new Response(
          JSON.stringify({ discord_user_id: null, message: "Could not verify — guild not accessible" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to search Discord members", discord_user_id: null }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const members = await res.json();
    log.info("resolve", `Discord returned ${members.length} members for query "${cleanUsername}" [${requestId}]`, {
      requestId,
      username: cleanUsername,
      resultCount: members.length,
    });

    const match = members.find(
      (m: any) => m.user?.username?.toLowerCase() === cleanUsername
    );

    if (match) {
      log.info("resolve", `Found exact match for "${cleanUsername}": Discord ID ${match.user.id} [${requestId}]`, {
        requestId,
        username: cleanUsername,
        discordUserId: match.user.id,
      });
      return new Response(
        JSON.stringify({ discord_user_id: match.user.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.warn("resolve", `No exact match for "${cleanUsername}" in guild [${requestId}]`, {
      requestId,
      username: cleanUsername,
      candidateUsernames: members.map((m: any) => m.user?.username).filter(Boolean),
    });
    return new Response(
      JSON.stringify({ discord_user_id: null, message: "User not found in server" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
