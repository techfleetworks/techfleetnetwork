import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("discord-notify");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotifyPayload {
  event:
    | "user_signed_up"
    | "profile_completed"
    | "task_completed"
    | "phase_completed"
    | "class_registered";
  display_name?: string;
  discord_username?: string;
  discord_user_id?: string;
  task_name?: string;
  phase_name?: string;
  class_name?: string;
  country?: string;
}

function buildActionText(payload: NotifyPayload): string {
  switch (payload.event) {
    case "user_signed_up":
      return "Signed up to Tech Fleet Network 🎉";
    case "profile_completed":
      return `Completed their profile setup${payload.country ? ` (🌍 ${payload.country})` : ""} ✅`;
    case "task_completed":
      return `Completed task: ${payload.task_name || "a task"} 📋`;
    case "phase_completed":
      return `Completed all tasks in ${payload.phase_name || "a phase"} 🏆🚀`;
    case "class_registered":
      return `Registered for ${payload.class_name || "a class"} 📚`;
    default:
      return "Performed an action on the platform 📢";
  }
}

function buildMessage(payload: NotifyPayload): string {
  let userTag: string;
  if (payload.discord_user_id) {
    userTag = `<@${payload.discord_user_id}>`;
  } else if (payload.discord_username) {
    userTag = `**@${payload.discord_username.replace(/^@/, "")}**`;
  } else {
    userTag = `**${payload.display_name || "A member"}**`;
  }

  const action = buildActionText(payload);
  return `${userTag} just did the following in Tech Fleet Network: **${action}**`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Request received [${requestId}]`, { requestId });

  try {
    const payload: NotifyPayload = await req.json();

    if (!payload?.event) {
      log.warn("handler", `Missing event in request payload [${requestId}]`, { requestId });
      return jsonResponse({ error: "Missing event" }, 400);
    }

    const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!DISCORD_WEBHOOK_URL) {
      log.warn("config", `DISCORD_WEBHOOK_URL is not configured; skipping notification [${requestId}]`, { requestId, event: payload.event });
      return jsonResponse({ success: false, skipped: true, reason: "webhook_not_configured" });
    }

    log.info("notify", `Processing event "${payload.event}" for "${payload.display_name || "unknown"}" [${requestId}]`, {
      requestId,
      event: payload.event,
      displayName: payload.display_name,
      discordUsername: payload.discord_username,
      discordUserId: payload.discord_user_id,
    });

    const discordBody = {
      content: buildMessage(payload),
      allowed_mentions: { users: payload.discord_user_id ? [payload.discord_user_id] : [] },
    };

    try {
      log.info("notify", `Sending webhook to Discord [${requestId}]`, { requestId, event: payload.event });
      const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordBody),
      });

      if (!discordRes.ok) {
        const errorText = await discordRes.text();
        log.warn("notify", `Discord API rejected webhook [${requestId}]: HTTP ${discordRes.status} — ${errorText}`, {
          requestId,
          httpStatus: discordRes.status,
          responseBody: errorText.substring(0, 500),
          event: payload.event,
        });
        return jsonResponse({ success: false, skipped: true, reason: "discord_api_error", status: discordRes.status });
      }

      await discordRes.text();
      log.info("notify", `Discord notification sent successfully [${requestId}]`, { requestId, event: payload.event });
      return jsonResponse({ success: true });
    } catch (err) {
      log.warn("notify", `Discord request failed; skipping notification [${requestId}]`, { requestId, event: payload.event }, err);
      return jsonResponse({ success: false, skipped: true, reason: "discord_request_failed" });
    }
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
