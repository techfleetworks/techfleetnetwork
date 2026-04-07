import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createEdgeLogger } from "../_shared/logger.ts";

const logger = createEdgeLogger("generate-discord-invite");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MAX_ONBOARDING_CANDIDATES = 12;
const BOT_USER_ID = "1381402399587561583"; // Tech Fleet Network Activity Bot#0394

// Hardcoded onboarding channels — these are permanent and don't change
const ONBOARDING_CHANNELS = [
  { id: "1080931652697608303", name: "welcome" },
  { id: "1080931652697608306", name: "general" },
] as const;

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

    // Try hardcoded onboarding channels directly — no discovery needed
    const candidates = ONBOARDING_CHANNELS;

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
        inviteErrors.push(`${channel.name} [${inviteRes.status}]: Missing invite code in Discord response`);
          logger.warn("create_invite", `Invite creation returned no code for channel ${channel.name}`, {
            channelId: channel.id,
            channelName: channel.name,
            status: inviteRes.status,
          });
          continue;
        }

        inviteUrl = `https://discord.gg/${inviteCode}`;
        logger.info("create_invite", `Created Discord invite in channel ${channel.name ?? channel.id}`, {
          channelId: channel.id,
          channelName: channel.name ?? null,
          matchStrategy: isExactOnboardingInviteChannel(channel)
            ? "exact_then_capable_fallback"
            : "capable_fallback_only",
        });
        break;
      }

      const errText = await inviteRes.text();
      inviteErrors.push(`${channel.name ?? channel.id} [${inviteRes.status}]: ${errText}`);
      logger.warn("create_invite", `Invite creation failed for channel ${channel.name ?? channel.id}`, {
        channelId: channel.id,
        channelName: channel.name ?? null,
        status: inviteRes.status,
        matchStrategy: isExactOnboardingInviteChannel(channel)
          ? "exact_then_capable_fallback"
          : "capable_fallback_only",
      });
    }

    if (!inviteUrl) {
      const errorSummary = `Discord bot failed to create invite in any of ${candidates.length} candidate channels. Top errors: ${summarizeInviteErrors(inviteErrors)}`;

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
          `onboarding_candidates:${onboardingCandidates.length}`,
          `fallback_candidates:${fallbackCandidates.length}`,
          `channel_match_strategy:${onboardingCandidates.length > 0 ? "exact_then_capable_fallback" : "capable_fallback_only"}`,
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
        `onboarding_candidates:${onboardingCandidates.length}`,
        `fallback_candidates:${fallbackCandidates.length}`,
        `channel_match_strategy:${onboardingCandidates.length > 0 ? "exact_then_capable_fallback" : "capable_fallback_only"}`,
      ],
    });

    logger.info("generate", `Generated fresh Discord invite for user ${user.id}`, {
      candidateCount: candidates.length,
      matchStrategy: onboardingCandidates.length > 0 ? "exact_then_capable_fallback" : "capable_fallback_only",
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