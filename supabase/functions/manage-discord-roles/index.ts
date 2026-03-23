import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

type RequestBody = ListAction | CreateAction;

function isValidAction(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.action === "list") return true;
  if (b.action === "create" && typeof b.name === "string" && b.name.trim().length > 0) return true;
  return false;
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
        JSON.stringify({ error: "Invalid request. Provide { action: 'list' } or { action: 'create', name: '...' }" }),
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
        return new Response(
          JSON.stringify({ error: "Failed to fetch Discord roles" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const roles = await res.json() as Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;

      // Filter out @everyone (position 0) and bot-managed roles; sort by name
      let filtered = roles
        .filter((r) => r.name !== "@everyone" && !r.managed)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Wildcard search if provided
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
          // mentionable = true → "Allow anyone to mention this role"
          mentionable: true,
          // No additional permissions — channel-level management only
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

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
