// @edge-auth
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { createEdgeLogger } from "../_shared/logger.ts";
import { discordFetch } from "../_shared/discord-fetch.ts";
import { withAuditWrapper } from "../_shared/audit.ts";

const log = createEdgeLogger("backfill-discord-usernames");

// Two-level ceiling on this bulk repair's live-Discord time so the server can never outrun the
// client's invokeEdge budget for "backfill-discord-usernames" (src/lib/edge/edge-timeouts.ts =
// 60_000). BACKFILL_TOTAL_BUDGET_MS bounds the WHOLE run (loop stops early, reporting the
// unprocessed remainder, rather than aborting the admin's browser mid-response);
// BACKFILL_PER_ITEM_BUDGET_MS bounds ONE member fetch so a single rate-limited/hung member can't
// swallow the run. Each item is capped at min(per-item, overall-remaining). ADR-0063.
const BACKFILL_TOTAL_BUDGET_MS = 57_000;
const BACKFILL_PER_ITEM_BUDGET_MS = 8_000;

// Shared CORS owner — allows the x-trace-id/x-request-id preflight headers the
// frontend invokeEdge wrapper attaches. Inline CORS omitting them fails preflight
// (see supabase/functions/CLAUDE.md).
import { corsHeaders } from "../_shared/http.ts";

function isUsable(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") return false;
  return trimmed.replace(/^\.+/, "").trim().length > 0;
}

serve(
  withAuditWrapper("backfill-discord-usernames", async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const requestId = crypto.randomUUID().substring(0, 8);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID");

    if (!BOT_TOKEN || !GUILD_ID) {
      return new Response(JSON.stringify({ error: "Discord bot not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (authErr || !userId) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Admin check
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Select candidate rows: linked AND (NULL username OR leading-dot)
    const { data: candidates, error: selectErr } = await adminClient
      .from("profiles")
      .select("user_id, discord_user_id, discord_username")
      .not("discord_user_id", "is", null)
      .neq("discord_user_id", "");

    if (selectErr) {
      return new Response(JSON.stringify({ error: "DB select failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targets = (candidates ?? []).filter((row: { discord_username: string | null }) => {
      return (
        !isUsable(row.discord_username) ||
        (typeof row.discord_username === "string" && row.discord_username.startsWith("."))
      );
    });

    let repaired = 0;
    let skipped_unchanged = 0;
    let skipped_discord_dot_legit = 0;
    let unprocessed = 0;
    let stopped_early = false;
    const errors: Array<{ user_id: string; reason: string }> = [];

    const startedAt = Date.now();

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      // Overall budget: stop before starting an item we have no time left to finish, and report the
      // remainder as unprocessed instead of letting the run overrun the client (a false timeout).
      const overallRemaining = BACKFILL_TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (overallRemaining <= 0) {
        stopped_early = true;
        unprocessed = targets.length - i;
        log.warn(
          "backfill",
          `Stopped early — time budget exhausted, ${unprocessed} unprocessed [${requestId}]`
        );
        break;
      }
      try {
        const memberUrl = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${row.discord_user_id}`;
        const { response } = await discordFetch(memberUrl, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
          maxRetries: 2,
          // One member's slice, never more than what's left of the whole-run budget.
          totalBudgetMs: Math.min(BACKFILL_PER_ITEM_BUDGET_MS, overallRemaining),
        });
        if (!response.ok) {
          await response.text().catch(() => "");
          errors.push({ user_id: row.user_id, reason: `discord-${response.status}` });
          continue;
        }
        const member = await response.json();
        const liveUsername: string = member?.user?.username ?? "";
        if (!isUsable(liveUsername)) {
          errors.push({ user_id: row.user_id, reason: "discord-empty-username" });
          continue;
        }
        const currentIsLeadingDot =
          typeof row.discord_username === "string" && row.discord_username.startsWith(".");
        if (currentIsLeadingDot && liveUsername.startsWith(".")) {
          skipped_discord_dot_legit++;
          continue;
        }
        if (liveUsername === row.discord_username) {
          skipped_unchanged++;
          continue;
        }
        const { error: updateErr } = await adminClient
          .from("profiles")
          .update({ discord_username: liveUsername })
          .eq("user_id", row.user_id);
        if (updateErr) {
          errors.push({ user_id: row.user_id, reason: "db-error" });
          continue;
        }
        try {
          await adminClient.rpc("write_audit_log", {
            p_event_type: "discord_username_repaired",
            p_table_name: "profiles",
            p_record_id: row.user_id,
            p_user_id: userId,
            p_changed_fields: [
              `old:${row.discord_username ?? "null"}`,
              `new:${liveUsername}`,
              "via:backfill",
            ],
          });
        } catch {
          /* swallow */
        }
        repaired++;
      } catch (err) {
        errors.push({ user_id: row.user_id, reason: (err as Error).message ?? "unknown" });
      }
    }

    log.info(
      "backfill",
      `Scanned ${targets.length}, repaired ${repaired}, unprocessed ${unprocessed} [${requestId}]`
    );

    return new Response(
      JSON.stringify({
        scanned: targets.length,
        repaired,
        skipped_unchanged,
        skipped_discord_dot_legit,
        // Partial-run signal: when the time budget stops the loop, the caller must re-run to finish
        // the remainder rather than assume every candidate was processed.
        stopped_early,
        unprocessed,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  })
);
