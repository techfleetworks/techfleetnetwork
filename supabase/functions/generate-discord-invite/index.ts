import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  getInviteChannelCandidates,
  type DiscordInviteChannel,
} from "../_shared/discord-invite-utils.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const logger = createEdgeLogger("generate-discord-invite");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has an invite URL
    const { data: profile } = await supabase
      .from("profiles")
      .select("discord_invite_url, has_discord_account, first_name")
      .eq("user_id", user.id)
      .single();

    if (profile?.discord_invite_url) {
      logger.info("check", `User ${user.id} already has invite URL`);
      return new Response(JSON.stringify({ invite_url: profile.discord_invite_url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique Discord invite via Bot API
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const guildId = Deno.env.get("DISCORD_GUILD_ID");
    if (!botToken || !guildId) {
      throw new Error("Discord bot configuration is missing");
    }

    // Fetch guild channels and try the most likely onboarding channels first,
    // while still falling back across every text channel deterministically.
    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!channelsRes.ok) {
      const errText = await channelsRes.text();
      throw new Error(`Failed to fetch guild channels [${channelsRes.status}]: ${errText}`);
    }

    const channels = await channelsRes.json();
    const candidates = getInviteChannelCandidates(
      channels as DiscordInviteChannel[],
    );

    if (candidates.length === 0) {
      throw new Error("No text channels found in Discord server");
    }

    logger.info("candidate_channels", `Prepared ${candidates.length} invite channel candidates`, {
      candidateCount: candidates.length,
      topCandidates: candidates.slice(0, 10).map((channel) => channel.name ?? channel.id),
    });

    let inviteUrl = "";
    const inviteErrors: string[] = [];

    for (const channel of candidates) {
      const inviteRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/invites`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_age: 604800,
          max_uses: 1,
          unique: true,
        }),
      });

      if (inviteRes.ok) {
        const invite = await inviteRes.json();
        inviteUrl = `https://discord.gg/${invite.code}`;
        logger.info("create_invite", `Created invite in channel ${channel.name ?? channel.id}`, {
          channelId: channel.id,
          channelName: channel.name ?? null,
        });
        break;
      }

      const errText = await inviteRes.text();
      inviteErrors.push(`${channel.name ?? channel.id} [${inviteRes.status}]: ${errText}`);
      logger.warn("create_invite", `Invite creation failed for channel ${channel.name ?? channel.id}`, {
        channelId: channel.id,
        channelName: channel.name ?? null,
        status: inviteRes.status,
      });
    }

    if (!inviteUrl) {
      throw new Error(
        `Failed to create Discord invite. The bot could not create an invite in any of the ${candidates.length} candidate text channels. This usually means a channel-level override is still denying "Create Invite" for the bot or its role. Errors: ${inviteErrors.slice(0, 12).join(" | ")}`,
      );
    }

    // Save invite URL to profile using service role
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) throw new Error("Missing service role key");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        discord_invite_url: inviteUrl,
        discord_invite_created_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      logger.error("save", `Failed to save invite URL: ${updateError.message}`);
      throw new Error("Failed to save invite link");
    }

    // Audit log
    await adminClient.rpc("write_audit_log", {
      p_event_type: "discord_invite_generated",
      p_table_name: "profiles",
      p_record_id: user.id,
      p_user_id: user.id,
      p_changed_fields: ["discord_invite_url"],
    });

    logger.info("generate", `Generated invite for user ${user.id}: ${inviteUrl}`);

    return new Response(JSON.stringify({ invite_url: inviteUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("handler", `Error: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
