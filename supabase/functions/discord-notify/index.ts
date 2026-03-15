import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  // Use real <@id> mention if we have the Discord user ID, otherwise bold the username
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!DISCORD_WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL is not configured");
    return new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const payload: NotifyPayload = await req.json();

    const discordBody = {
      content: buildMessage(payload),
      allowed_mentions: { users: payload.discord_user_id ? [payload.discord_user_id] : [] },
    };

    const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordBody),
    });

    if (!discordRes.ok) {
      const errorText = await discordRes.text();
      console.error(`Discord API error [${discordRes.status}]: ${errorText}`);
      return new Response(
        JSON.stringify({ error: "Failed to send Discord notification" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await discordRes.text();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Discord notify error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
