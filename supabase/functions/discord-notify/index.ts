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
  task_name?: string;
  phase_name?: string;
  class_name?: string;
  country?: string;
}

const EVENT_EMOJIS: Record<string, string> = {
  user_signed_up: "🎉",
  profile_completed: "✅",
  task_completed: "📋",
  phase_completed: "🏆",
  class_registered: "📚",
};

function buildEmbed(payload: NotifyPayload) {
  const name = payload.display_name || "A member";
  const emoji = EVENT_EMOJIS[payload.event] || "📢";

  switch (payload.event) {
    case "user_signed_up":
      return {
        title: `${emoji} New Member Joined!`,
        description: `**${name}** just signed up to Tech Fleet Network.`,
        color: 0x22c55e, // green
      };
    case "profile_completed":
      return {
        title: `${emoji} Profile Completed`,
        description: `**${name}** finished setting up their profile.${payload.country ? `\n🌍 Based in **${payload.country}**` : ""}`,
        color: 0x3b82f6, // blue
      };
    case "task_completed":
      return {
        title: `${emoji} Task Completed`,
        description: `**${name}** completed: **${payload.task_name || "a task"}**`,
        color: 0xf59e0b, // amber
      };
    case "phase_completed":
      return {
        title: `${emoji} Phase Completed!`,
        description: `**${name}** completed all tasks in **${payload.phase_name || "a phase"}**! 🚀`,
        color: 0xa855f7, // purple
      };
    case "class_registered":
      return {
        title: `${emoji} Class Registration`,
        description: `**${name}** registered for **${payload.class_name || "a class"}**.`,
        color: 0x06b6d4, // cyan
      };
    default:
      return {
        title: `${emoji} Activity`,
        description: `**${name}** performed an action on the platform.`,
        color: 0x6b7280,
      };
  }
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

    const embed = buildEmbed(payload);
    embed["timestamp"] = new Date().toISOString();
    embed["footer"] = { text: "Tech Fleet Network" };

    const discordBody = {
      embeds: [embed],
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

    await discordRes.text(); // consume body

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
