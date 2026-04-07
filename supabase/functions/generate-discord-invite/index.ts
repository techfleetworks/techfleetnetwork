import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  EXACT_ONBOARDING_CHANNEL_NAMES,
  getInviteCapableChannels,
  getInviteChannelCandidates,
  isExactOnboardingInviteChannel,
  type DiscordInviteChannel,
  type DiscordGuildRole,
} from "../_shared/discord-invite-utils.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const logger = createEdgeLogger("generate-discord-invite");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MAX_ONBOARDING_CANDIDATES = 12;

function summarizeInviteErrors(inviteErrors: string[]) {
  return inviteErrors.slice(0, 12).join(" | ");
}

type AuditLogParams = {
  supabaseUrl: string;
  eventType: string;
  recordId: string;
  userId: string;
  tableName?: string;
  errorMessage?: string;
  changedFields?: string[];
};

async function writeDiscordAuditLog({
  supabaseUrl,
  eventType,
  recordId,
  userId,
  tableName = "discord_integration",
  errorMessage,
  changedFields,
}: AuditLogParams) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey || !supabaseUrl) return;

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const payload: Record<string, unknown> = {
      p_event_type: eventType,
      p_table_name: tableName,
      p_record_id: recordId,
      p_user_id: userId,
    };

    if (errorMessage) {
      payload.p_error_message = errorMessage.substring(0, 4000);
    }

    if (changedFields?.length) {
      payload.p_changed_fields = changedFields;
    }

    await adminClient.rpc("write_audit_log", payload);
  } catch (auditError) {
    logger.warn("audit_log", "Failed to write Discord event to audit log", {
      error: String(auditError),
      eventType,
      recordId,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  let auditUserId = ZERO_UUID;
  let errorAlreadyAudited = false;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    auditUserId = user.id;

    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const guildId = Deno.env.get("DISCORD_GUILD_ID");
    if (!botToken || !guildId) {
      throw new Error("Discord bot configuration is missing");
    }

    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!channelsRes.ok) {
      const errText = await channelsRes.text();
      throw new Error(`Failed to fetch guild channels [${channelsRes.status}]: ${errText}`);
    }

    const channels = await channelsRes.json() as DiscordInviteChannel[];

    const botMemberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!botMemberRes.ok) {
      const errText = await botMemberRes.text();
      throw new Error(`Failed to fetch bot membership [${botMemberRes.status}]: ${errText}`);
    }

    const botMember = await botMemberRes.json() as { user?: { id?: string }; roles?: string[] };
    const botUserId = botMember.user?.id;
    const botRoleIds = botMember.roles ?? [];

    if (!botUserId) {
      throw new Error("Discord bot membership response did not include a user id");
    }

    const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!rolesRes.ok) {
      const errText = await rolesRes.text();
      throw new Error(`Failed to fetch guild roles [${rolesRes.status}]: ${errText}`);
    }

    const guildRoles = await rolesRes.json() as DiscordGuildRole[];

    const inviteCapableChannels = getInviteCapableChannels({
      channels,
      guildId,
      guildRoles,
      memberRoleIds: botRoleIds,
      memberUserId: botUserId,
    });

    const allCandidates = getInviteChannelCandidates(inviteCapableChannels);
    const onboardingCandidates = allCandidates
      .filter(isExactOnboardingInviteChannel)
      .slice(0, MAX_ONBOARDING_CANDIDATES);

    if (onboardingCandidates.length === 0) {
      const inviteCapableChannelNames = inviteCapableChannels
        .map((channel) => channel.name ?? channel.id)
        .slice(0, 25);

      throw new Error(
        `No onboarding invite channel is currently usable by the Discord bot. Expected one of: ${EXACT_ONBOARDING_CHANNEL_NAMES.join(", ")}. Invite-capable channels found: ${inviteCapableChannelNames.join(", ") || "none"}`,
      );
    }

    const candidates = onboardingCandidates;

    logger.info("candidate_channels", `Prepared ${candidates.length} exact onboarding invite channel candidates`, {
      candidateCount: candidates.length,
      topCandidates: candidates.map((channel) => channel.name ?? channel.id),
      inviteCapableChannelCount: inviteCapableChannels.length,
      matchStrategy: "exact_name",
      allowedChannelNames: [...EXACT_ONBOARDING_CHANNEL_NAMES],
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
        const invite = await inviteRes.json().catch(() => null) as { code?: string } | null;
        const inviteCode = invite?.code;

        if (!inviteCode) {
          inviteErrors.push(`${channel.name ?? channel.id} [${inviteRes.status}]: Missing invite code in Discord response`);
          logger.warn("create_invite", `Invite creation returned no code for channel ${channel.name ?? channel.id}`, {
            channelId: channel.id,
            channelName: channel.name ?? null,
            status: inviteRes.status,
          });
          continue;
        }

        inviteUrl = `https://discord.gg/${inviteCode}`;
        logger.info("create_invite", `Created onboarding invite in channel ${channel.name ?? channel.id}`, {
          channelId: channel.id,
          channelName: channel.name ?? null,
          matchStrategy: "exact_name",
        });
        break;
      }

      const errText = await inviteRes.text();
      inviteErrors.push(`${channel.name ?? channel.id} [${inviteRes.status}]: ${errText}`);
      logger.warn("create_invite", `Invite creation failed for channel ${channel.name ?? channel.id}`, {
        channelId: channel.id,
        channelName: channel.name ?? null,
        status: inviteRes.status,
        matchStrategy: "exact_name",
      });
    }

    if (!inviteUrl) {
      const errorSummary = `Discord bot failed to create onboarding invite in any of ${candidates.length} onboarding channels. Top errors: ${summarizeInviteErrors(inviteErrors)}`;

      await writeDiscordAuditLog({
        supabaseUrl,
        eventType: "discord_bot_error",
        recordId: user.id,
        userId: user.id,
        errorMessage: errorSummary,
        changedFields: [
          `guild_id:${guildId}`,
          `candidate_channels:${candidates.length}`,
          `invite_capable_channels:${inviteCapableChannels.length}`,
          "channel_match_strategy:exact_name",
          `expected_channel_names:${EXACT_ONBOARDING_CHANNEL_NAMES.join(",")}`,
          `attempted_channels:${candidates.map((channel) => channel.name ?? channel.id).join(",")}`,
          `all_status_codes:${[...new Set(inviteErrors.map((entry) => entry.match(/\[(\d+)\]/)?.[1]).filter(Boolean))].join(",")}`,
        ],
      });
      errorAlreadyAudited = true;

      throw new Error(errorSummary);
    }

    await writeDiscordAuditLog({
      supabaseUrl,
      eventType: "discord_invite_generated",
      recordId: user.id,
      userId: user.id,
      tableName: "profiles",
      changedFields: [
        "invite_type:onboarding",
        `candidate_channels:${candidates.length}`,
        "channel_match_strategy:exact_name",
      ],
    });

    logger.info("generate", `Generated fresh onboarding invite for user ${user.id}`, {
      candidateCount: candidates.length,
      matchStrategy: "exact_name",
    });

    return new Response(JSON.stringify({ invite_url: inviteUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("handler", `Error: ${message}`);

    if (!errorAlreadyAudited) {
      await writeDiscordAuditLog({
        supabaseUrl,
        eventType: "discord_bot_error",
        recordId: "generate-discord-invite",
        userId: auditUserId,
        errorMessage: message,
      });
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});