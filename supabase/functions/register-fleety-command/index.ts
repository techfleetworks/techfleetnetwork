import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("register-fleety-command");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const appId = Deno.env.get("DISCORD_APPLICATION_ID");

    if (!botToken || !appId) {
      throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID");
    }

    // Register the /fleety global slash command
    const res = await fetch(
      `https://discord.com/api/v10/applications/${appId}/commands`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "fleety",
          description:
            "Ask Fleety about Tech Fleet — guidance, resources, workshops, and more",
          type: 1, // CHAT_INPUT
          options: [
            {
              name: "question",
              description: "Your question about Tech Fleet",
              type: 3, // STRING
              required: true,
            },
          ],
        }),
      },
    );

    const data = await res.json();

    if (!res.ok) {
      log.error("register", `Discord API error [${res.status}]: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info("register", `Slash command registered: ${data.id}`);

    return new Response(
      JSON.stringify({ success: true, command_id: data.id, name: data.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("register", `Error: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
