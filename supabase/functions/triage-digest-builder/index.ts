/**
 * triage-digest-builder
 *
 * Daily summary of the error triage queue + audit pressure for admins.
 * Sends ONE Discord webhook message + ONE email per admin per day
 * (idempotency-keyed so re-runs are safe).
 *
 * Cost discipline:
 *   - Pure SQL aggregation, NO AI calls
 *   - Service-role only (cron-invoked)
 *   - Idempotent per UTC day per admin
 *   - One Discord post total (uses DISCORD_PLATFORM_UPDATES_WEBHOOK)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { queueTransactionalEmail } from "../_shared/transactional-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DISCORD_WEBHOOK = Deno.env.get("DISCORD_PLATFORM_UPDATES_WEBHOOK") ?? "";
const SITE_URL = "https://techfleet.network";

interface QueueRow {
  event_type: string;
  source: string;
  occurrence_count: number;
  status: string;
  last_seen_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Service-role gate: only the cron job (or admins via service-role key) may call.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.includes(SERVICE_ROLE)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ---- Queue stats --------------------------------------------------------
  const { data: openRows } = await supabase
    .from("agent_fix_queue")
    .select("event_type,source,occurrence_count,status,last_seen_at")
    .in("status", ["pending", "triaged", "proposed"])
    .order("occurrence_count", { ascending: false })
    .limit(50);

  const open = (openRows ?? []) as QueueRow[];
  const pendingCount = open.filter((r) => r.status === "pending").length;
  const proposedCount = open.filter((r) => r.status === "proposed").length;
  const topItems = open.slice(0, 8);

  const { count: resolvedYesterday } = await supabase
    .from("agent_fix_queue")
    .select("*", { count: "exact", head: true })
    .in("status", ["resolved", "dismissed"])
    .gte("updated_at", yesterdayIso);

  // ---- Pressure + 24h volume ----------------------------------------------
  const { data: healthRow } = await supabase
    .from("system_health_state")
    .select("metadata")
    .eq("id", 1)
    .maybeSingle();
  const meta = (healthRow?.metadata ?? {}) as { audit_pressure?: string };
  const auditPressure = (meta.audit_pressure ?? "none") as Props["auditPressure"];

  const { count: audit24h } = await supabase
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", yesterdayIso);

  // Lane 2 self-heal counter — how many transient failures auto-recovered
  const { count: recovered24h } = await supabase
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "external_api_recovered")
    .gte("created_at", yesterdayIso);

  const { data: budget } = await supabase
    .from("agent_triage_budget")
    .select("triage_calls_used,day")
    .eq("id", 1)
    .maybeSingle();
  const triageBudgetUsed = budget?.day === todayStr ? (budget.triage_calls_used ?? 0) : 0;

  // ---- Skip-send guard: nothing pending AND nothing resolved -------------
  // Don't spam admins on quiet days. Always send when there's open work.
  const isQuietDay = pendingCount === 0 && proposedCount === 0 && (resolvedYesterday ?? 0) === 0 && auditPressure === "none";

  // ---- Discord (single post) ---------------------------------------------
  let discordSent = false;
  if (!isQuietDay && DISCORD_WEBHOOK) {
    const lines = [
      `**Daily Triage Digest — ${todayStr}**`,
      `🔴 Pending: **${pendingCount}**  ·  💡 Proposed: **${proposedCount}**  ·  ✅ Resolved 24h: **${resolvedYesterday ?? 0}**`,
      `📊 Audit volume 24h: **${(audit24h ?? 0).toLocaleString()}**  ·  Pressure: **${auditPressure}**  ·  AI budget: ${triageBudgetUsed}/20`,
      ...(topItems.length
        ? ["", "**Top open errors:**", ...topItems.slice(0, 5).map((it) =>
            `• \`${it.event_type}\` ×${it.occurrence_count} — ${it.source.slice(0, 80)} *(${it.status})*`,
          )]
        : []),
      ``,
      `<${SITE_URL}/admin/system-health?tab=triage>`,
    ].join("\n");
    try {
      const resp = await fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lines.slice(0, 1900) }),
      });
      discordSent = resp.ok;
    } catch (_e) { /* swallow — telemetry must never throw */ }
  }

  // ---- Email each admin (idempotent per day) -----------------------------
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  let emailsSent = 0;
  if (!isQuietDay && admins && admins.length > 0) {
    const adminIds = admins.map((a: { user_id: string }) => a.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, first_name")
      .in("user_id", adminIds);

    for (const p of (profiles ?? [])) {
      if (!p.email) continue;
      const idemKey = `triage-digest:${p.user_id}:${todayStr}`;
      const res = await queueTransactionalEmail({
        templateName: "triage-digest",
        recipientEmail: p.email,
        idempotencyKey: idemKey,
        supabase,
        templateData: {
          firstName: p.first_name || "Admin",
          date: todayStr,
          pendingCount,
          proposedCount,
          resolvedYesterday: resolvedYesterday ?? 0,
          auditPressure,
          audit24hCount: audit24h ?? 0,
          topItems,
          triageBudgetUsed,
          triageBudgetCap: 20,
          adminUrl: `${SITE_URL}/admin/system-health?tab=triage`,
        },
      });
      if (res.ok) emailsSent += 1;
    }
  }

  return json({
    ok: true,
    quietDay: isQuietDay,
    pendingCount,
    proposedCount,
    resolvedYesterday: resolvedYesterday ?? 0,
    auditPressure,
    audit24h: audit24h ?? 0,
    discordSent,
    emailsSent,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Type alias for the email template props we pass in.
type Props = {
  auditPressure?: 'none' | 'soft' | 'medium' | 'hard';
};
