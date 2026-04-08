import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createEdgeLogger } from "../_shared/logger.ts";
import { discordFetch } from "../_shared/discord-fetch.ts";

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

    const body = await req.json();
    const discord_username = body.discord_username;
    const confirm_user_id = body.confirm_user_id; // Optional: user picked a candidate
    if (confirm_user_id && typeof confirm_user_id === "string" && confirm_user_id.length <= 20) {
      // Direct confirmation — no search needed
      log.info("resolve", `Direct confirmation of Discord user ID ${confirm_user_id} [${requestId}]`, { requestId, confirm_user_id });
      return new Response(
        JSON.stringify({ discord_user_id: confirm_user_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!discord_username || typeof discord_username !== "string" || discord_username.length > MAX_USERNAME_LENGTH) {
      log.warn("validate", `Missing discord_username in request body [${requestId}]`, { requestId });
      return new Response(
        JSON.stringify({ error: "discord_username is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawUsername = discord_username.trim().toLowerCase();
    const cleanUsername = rawUsername.replace(/^[@.]+/, "");
    const searchQueries = [...new Set([rawUsername, cleanUsername, `.${cleanUsername}`])];
    log.info("resolve", `Searching Discord guild for username "${cleanUsername}" (raw: "${rawUsername}") [${requestId}]`, {
      requestId,
      username: cleanUsername,
      rawUsername,
      guildId: GUILD_ID,
    });

    // Run searches and merge results with auto-retry
    const allMembers: any[] = [];
    const seenIds = new Set<string>();
    for (const query of searchQueries) {
      const searchUrl = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(query)}&limit=10`;
      
      try {
        const { response: res, retries } = await discordFetch(searchUrl, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
        });

        if (retries > 0) {
          log.info("resolve", `Discord search for "${query}" succeeded after ${retries} retries [${requestId}]`, { requestId, retries });
        }

        if (res.ok) {
          const members = await res.json();
          for (const m of members) {
            if (m.user?.id && !seenIds.has(m.user.id)) {
              seenIds.add(m.user.id);
              allMembers.push(m);
            }
          }
        } else {
          const errorText = await res.text();
          log.error("resolve", `Discord API error for query "${query}" [${requestId}]: HTTP ${res.status} — ${errorText}`, {
            requestId, httpStatus: res.status, query,
          });
          if (allMembers.length === 0) {
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
        }
      } catch (fetchErr) {
        log.error("resolve", `Network error for query "${query}" after retries [${requestId}]: ${fetchErr}`, { requestId, query });
        if (allMembers.length === 0) {
          return new Response(
            JSON.stringify({ error: "Failed to reach Discord API", discord_user_id: null }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const members = allMembers;
    const candidateUsernames = members.map((m: any) => m.user?.username).filter(Boolean);
    const candidateGlobalNames = members.map((m: any) => m.user?.global_name).filter(Boolean);
    const candidateNicks = members.map((m: any) => m.nick).filter(Boolean);
    log.info("resolve", `Discord returned ${members.length} members for query "${cleanUsername}" [${requestId}]`, {
      requestId,
      username: cleanUsername,
      rawUsername,
      resultCount: members.length,
      candidateUsernames,
      candidateGlobalNames,
      candidateNicks,
    });

    // Match on cleaned username, raw username, or dot-prefixed variant
    const matchCandidates = new Set([cleanUsername, rawUsername, `.${cleanUsername}`]);
    const match = members.find(
      (m: any) => {
        const u = m.user?.username?.toLowerCase();
        return u ? matchCandidates.has(u) : false;
      }
    );

    // Audit-log helper
    const auditLog = async (eventType: string, message: string, fields: string[], isError = false) => {
      try {
        const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const url = Deno.env.get("SUPABASE_URL");
        if (srk && url) {
          const ac = createClient(url, srk);
          await ac.rpc("write_audit_log", {
            p_event_type: eventType,
            p_table_name: "discord_integration",
            p_record_id: `resolve-discord-id:${requestId}`,
            p_user_id: "00000000-0000-0000-0000-000000000000",
            p_error_message: isError ? message : null,
            p_changed_fields: [...fields, ...(isError ? [] : [`info:${message}`])],
          });
        }
      } catch { /* swallow */ }
    };

    if (match) {
      log.info("resolve", `Found exact match for "${cleanUsername}": Discord ID ${match.user.id} [${requestId}]`, {
        requestId,
        username: cleanUsername,
        discordUserId: match.user.id,
      });
      await auditLog(
        "discord_username_verified",
        `Verified "${cleanUsername}" → Discord ID ${match.user.id}`,
        [`username:${cleanUsername}`, `discord_id:${match.user.id}`, `result_count:${members.length}`]
      );
      const avatarHash = match.user?.avatar;
      const avatarUrl = avatarHash
        ? `https://cdn.discordapp.com/avatars/${match.user.id}/${avatarHash}.png?size=256`
        : null;
      return new Response(
        JSON.stringify({ discord_user_id: match.user.id, avatar_url: avatarUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build candidate list for the UI picker
    const candidates = members.slice(0, 10).map((m: any) => ({
      id: m.user?.id,
      username: m.user?.username,
      global_name: m.user?.global_name || null,
      nick: m.nick || null,
      avatar: m.user?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
        : null,
    }));

    log.warn("resolve", `No exact match for "${cleanUsername}" in guild — returning ${candidates.length} candidates [${requestId}]`, {
      requestId,
      username: cleanUsername,
      candidateUsernames,
      candidateGlobalNames,
      candidateNicks,
    });
    await auditLog(
      "discord_username_not_found",
      `No match for "${cleanUsername}" — Discord returned ${members.length} candidates: usernames=[${candidateUsernames.join(",")}] display_names=[${candidateGlobalNames.join(",")}] nicknames=[${candidateNicks.join(",")}]`,
      [`username:${cleanUsername}`, `result_count:${members.length}`, ...candidateUsernames.map((u: string) => `candidate:${u}`)]
    );
    return new Response(
      JSON.stringify({
        discord_user_id: null,
        message: candidates.length > 0
          ? "No exact username match found. Did you mean one of these members?"
          : "User not found in server",
        candidates: candidates.length > 0 ? candidates : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    const message = err instanceof Error ? err.message : "Unknown error";

    try {
      const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const url = Deno.env.get("SUPABASE_URL");
      if (srk && url) {
        const ac = createClient(url, srk);
        await ac.rpc("write_audit_log", {
          p_event_type: "discord_bot_error",
          p_table_name: "discord_integration",
          p_record_id: "resolve-discord-id",
          p_user_id: "00000000-0000-0000-0000-000000000000",
          p_error_message: message.substring(0, 4000),
        });
      }
    } catch { /* swallow */ }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
