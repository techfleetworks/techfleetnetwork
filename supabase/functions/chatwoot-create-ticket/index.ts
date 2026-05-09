/**
 * chatwoot-create-ticket — authenticated. Creates a Chatwoot conversation
 * server-side on behalf of the signed-in user, then returns the new
 * conversation id. Used by the existing "Submit Feedback" / "Report a bug"
 * UI flows so they continue to validate input through our existing
 * sanitization pipeline rather than relying on the embedded widget.
 *
 * Body: { subject?: string, message: string, inbox: 'support'|'bug' }
 */
import { withAuditWrapper } from "../_shared/audit.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(withAuditWrapper("chatwoot-create-ticket", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const baseUrl = Deno.env.get("CHATWOOT_BASE_URL");
  const apiToken = Deno.env.get("CHATWOOT_API_ACCESS_TOKEN");
  const accountId = Deno.env.get("CHATWOOT_ACCOUNT_ID");
  const supportInboxId = Deno.env.get("CHATWOOT_SUPPORT_INBOX_ID");
  const bugInboxId = Deno.env.get("CHATWOOT_BUG_INBOX_ID");
  if (!baseUrl || !apiToken || !accountId) return json({ error: "chatwoot_not_configured" }, 503);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const message = String(body.message ?? "").trim();
  const subject = String(body.subject ?? "").trim().slice(0, 200);
  const inbox = body.inbox === "bug" ? "bug" : "support";
  if (!message || message.length > 5000) return json({ error: "invalid_message" }, 400);
  const inboxId = inbox === "bug" ? bugInboxId : supportInboxId;
  if (!inboxId) return json({ error: "inbox_not_configured" }, 503);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  const { data: profile } = await userClient
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", user.id)
    .maybeSingle();
  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || (user.email ?? "Tech Fleet member")
    : (user.email ?? "Tech Fleet member");

  const apiBase = `${baseUrl.replace(/\/$/, "")}/api/v1/accounts/${accountId}`;
  const headers = {
    "Content-Type": "application/json",
    "api_access_token": apiToken,
  };

  // 1. Find or create contact
  let contactId: number | null = null;
  const searchRes = await fetch(`${apiBase}/contacts/search?q=${encodeURIComponent(user.id)}`, { headers });
  if (searchRes.ok) {
    const searchJson = await searchRes.json();
    contactId = searchJson?.payload?.[0]?.id ?? null;
  }
  if (!contactId) {
    const createRes = await fetch(`${apiBase}/contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        identifier: user.id,
        name: fullName,
        email: user.email ?? undefined,
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      return json({ error: "contact_create_failed", detail: t.slice(0, 500) }, 502);
    }
    const createJson = await createRes.json();
    contactId = createJson?.payload?.contact?.id ?? null;
  }
  if (!contactId) return json({ error: "contact_unavailable" }, 502);

  // 2. Create conversation
  const convRes = await fetch(`${apiBase}/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source_id: user.id,
      inbox_id: Number(inboxId),
      contact_id: contactId,
      additional_attributes: { subject: subject || (inbox === "bug" ? "Bug report" : "Support request") },
      message: { content: message, message_type: "incoming" },
    }),
  });
  if (!convRes.ok) {
    const t = await convRes.text();
    return json({ error: "conversation_create_failed", detail: t.slice(0, 500) }, 502);
  }
  const conv = await convRes.json();
  return json({ ok: true, conversation_id: conv?.id ?? null });
}));
