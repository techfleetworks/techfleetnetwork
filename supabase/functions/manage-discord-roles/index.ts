import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("manage-discord-roles");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BODY_BYTES = 4 * 1024;
const MAX_ROLE_NAME_LENGTH = 100;

interface ListAction {
  action: "list";
  search?: string;
}

interface CreateAction {
  action: "create";
  name: string;
}

interface AssignAction {
  action: "assign";
  discord_user_id: string;
  role_id: string;
}

interface RemoveAction {
  action: "remove";
  discord_user_id: string;
  role_id: string;
}

type RequestBody = ListAction | CreateAction | AssignAction | RemoveAction;

function isValidAction(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.action === "list") return true;
  if (b.action === "create" && typeof b.name === "string" && b.name.trim().length > 0) return true;
  if (b.action === "assign" && typeof b.discord_user_id === "string" && typeof b.role_id === "string" &&
      b.discord_user_id.trim().length > 0 && b.role_id.trim().length > 0) return true;
  if (b.action === "remove" && typeof b.discord_user_id === "string" && typeof b.role_id === "string" &&
      b.discord_user_id.trim().length > 0 && b.role_id.trim().length > 0) return true;
  return false;
}

async function logDiscordError(action: string, status: number, errorText: string, requestId: string) {
  try {
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    if (srk && url) {
      const ac = createClient(url, srk);
      await ac.rpc("write_audit_log", {
        p_event_type: "discord_bot_error",
        p_table_name: "discord_integration",
        p_record_id: `manage-discord-roles:${action}`,
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_error_message: `[${action}] HTTP ${status} — ${errorText}`.substring(0, 4000),
        p_changed_fields: [`request_id:${requestId}`, `http_status:${status}`],
      });
    }
  } catch { /* swallow */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Request received [${requestId}]`);

  const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
  const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");

  if (!BOT_TOKEN || !GUILD_ID) {
    log.error("config", `Discord bot not configured [${requestId}]`);
    return new Response(
      JSON.stringify({ error: "Discord bot not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "Request body too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    if (!isValidAction(body)) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Provide { action: 'list' | 'create' | 'assign' | 'remove', ... }" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const discordHeaders = { Authorization: `Bot ${BOT_TOKEN}` };

    // ---------- LIST ----------
    if (body.action === "list") {
      log.info("list", `Fetching guild roles [${requestId}]`);
      const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
        headers: discordHeaders,
      });

      if (!res.ok) {
        const errorText = await res.text();
        log.error("list", `Discord API error [${requestId}]: ${res.status} — ${errorText.substring(0, 500)}`);
        await logDiscordError("list", res.status, errorText.substring(0, 500), requestId);
        return new Response(
          JSON.stringify({ error: "Failed to fetch Discord roles" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const roles = await res.json() as Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;

      let filtered = roles
        .filter((r) => r.name !== "@everyone" && !r.managed)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (body.search && typeof body.search === "string" && body.search.trim()) {
        const q = body.search.trim().toLowerCase();
        filtered = filtered.filter((r) => r.name.toLowerCase().includes(q));
      }

      const result = filtered.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
      }));

      log.info("list", `Returning ${result.length} roles [${requestId}]`);
      return new Response(
        JSON.stringify({ roles: result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- CREATE ----------
    if (body.action === "create") {
      const roleName = body.name.trim();
      if (roleName.length > MAX_ROLE_NAME_LENGTH) {
        return new Response(
          JSON.stringify({ error: `Role name must be ${MAX_ROLE_NAME_LENGTH} characters or fewer` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      log.info("create", `Creating Discord role "${roleName}" [${requestId}]`);

      const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
        method: "POST",
        headers: { ...discordHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roleName,
          mentionable: true,
          permissions: "0",
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        log.error("create", `Discord API error creating role [${requestId}]: ${res.status} — ${errorText.substring(0, 500)}`);
        return new Response(
          JSON.stringify({ error: "Failed to create Discord role" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const role = await res.json() as { id: string; name: string; color: number; position: number };
      log.info("create", `Created role "${role.name}" (${role.id}) [${requestId}]`);

      return new Response(
        JSON.stringify({ role: { id: role.id, name: role.name, color: role.color, position: role.position } }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- ASSIGN ----------
    if (body.action === "assign") {
      const { discord_user_id, role_id } = body;
      log.info("assign", `Assigning role ${role_id} to user ${discord_user_id} [${requestId}]`);

      const res = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discord_user_id}/roles/${role_id}`,
        {
          method: "PUT",
          headers: discordHeaders,
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        log.error("assign", `Discord API error assigning role [${requestId}]: ${res.status} — ${errorText.substring(0, 500)}`);

        const status = res.status;
        let userMessage = "Failed to assign Discord role";
        if (status === 403) userMessage = "Bot lacks permission to assign this role. Ensure the bot's role is higher than the target role in Discord server settings.";
        if (status === 404) userMessage = "Discord user or role not found in this server.";
        if (status === 429) userMessage = "Rate limited by Discord. Please try again shortly.";

        return new Response(
          JSON.stringify({ error: userMessage }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Discord returns 204 No Content on success
      await res.text(); // consume body
      log.info("assign", `Role ${role_id} assigned to user ${discord_user_id} [${requestId}]`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- REMOVE ----------
    if (body.action === "remove") {
      const { discord_user_id, role_id } = body;
      log.info("remove", `Removing role ${role_id} from user ${discord_user_id} [${requestId}]`);

      const res = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discord_user_id}/roles/${role_id}`,
        {
          method: "DELETE",
          headers: discordHeaders,
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        log.error("remove", `Discord API error removing role [${requestId}]: ${res.status} — ${errorText.substring(0, 500)}`);

        const status = res.status;
        let userMessage = "Failed to remove Discord role";
        if (status === 403) userMessage = "Bot lacks permission to remove this role.";
        if (status === 404) userMessage = "Discord user or role not found in this server.";

        return new Response(
          JSON.stringify({ error: userMessage }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await res.text(); // consume body
      log.info("remove", `Role ${role_id} removed from user ${discord_user_id} [${requestId}]`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
          p_record_id: "manage-discord-roles",
          p_user_id: "00000000-0000-0000-0000-000000000000",
          p_error_message: message.substring(0, 4000),
        });
      }
    } catch { /* swallow */ }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
