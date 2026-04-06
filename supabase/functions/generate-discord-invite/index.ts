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

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const COMMUNITY_ROLE_ID = "1083439364975112293";
const MAX_ONBOARDING_CANDIDATES = 12;
const ONBOARDING_CHANNEL_HINTS = [
  "welcome",
  "general",
  "start-here",
  "introduction",
  "getting-started",
  "get-started",
  "onboarding",
  "community",
] as const;

function normalizeChannelName(name?: string) {
  return (name ?? "").trim().toLowerCase();
}

function isOnboardingInviteChannel(channel: DiscordInviteChannel) {
  const name = normalizeChannelName(channel.name);
  return ONBOARDING_CHANNEL_HINTS.some((hint) => name.includes(hint));
}

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

    const channels = await channelsRes.json();
    const allCandidates = getInviteChannelCandidates(channels as DiscordInviteChannel[]);
    const onboardingCandidates = allCandidates
      .filter(isOnboardingInviteChannel)
      .slice(0, MAX_ONBOARDING_CANDIDATES);
    const candidates = onboardingCandidates.length > 0
      ? onboardingCandidates
      : allCandidates.slice(0, MAX_ONBOARDING_CANDIDATES);

    if (candidates.length === 0) {
      throw new Error("No onboarding invite channels found in Discord server");
    }

    logger.info("candidate_channels", `Prepared ${candidates.length} onboarding invite channel candidates`, {
      candidateCount: candidates.length,
      topCandidates: candidates.map((channel) => channel.name ?? channel.id),
      communityRoleId: COMMUNITY_ROLE_ID,
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
          role_ids: [COMMUNITY_ROLE_ID],
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
            communityRoleId: COMMUNITY_ROLE_ID,
          });
          continue;
        }

        inviteUrl = `https://discord.gg/${inviteCode}`;
        logger.info("create_invite", `Created onboarding invite in channel ${channel.name ?? channel.id}`, {
          channelId: channel.id,
          channelName: channel.name ?? null,
          communityRoleId: COMMUNITY_ROLE_ID,
        });
        break;
      }

      const errText = await inviteRes.text();
      inviteErrors.push(`${channel.name ?? channel.id} [${inviteRes.status}]: ${errText}`);
      logger.warn("create_invite", `Invite creation failed for channel ${channel.name ?? channel.id}`, {
        channelId: channel.id,
        channelName: channel.name ?? null,
        status: inviteRes.status,
        communityRoleId: COMMUNITY_ROLE_ID,
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
          `community_role_id:${COMMUNITY_ROLE_ID}`,
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
        `community_role_id:${COMMUNITY_ROLE_ID}`,
        `candidate_channels:${candidates.length}`,
      ],
    });

    logger.info("generate", `Generated fresh onboarding invite for user ${user.id}`, {
      communityRoleId: COMMUNITY_ROLE_ID,
      candidateCount: candidates.length,
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