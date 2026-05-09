/**
 * chatwoot-webhook — public endpoint called by the self-hosted Chatwoot
 * server. Authenticated by a shared secret in the X-Chatwoot-Signature header
 * (HMAC SHA-256 of the raw body, hex-encoded, computed with CHATWOOT_WEBHOOK_SECRET).
 *
 * Handles:
 *   - conversation_created
 *   - conversation_status_changed / conversation_updated
 *   - message_created
 *
 * Side effects:
 *   - Upserts public.tickets (idempotent on chatwoot_conversation_id)
 *   - Inserts an append-only public.ticket_events row
 *   - Inserts a public.notifications row when an admin replies to a trainee
 *   - Routes Bug Reports inbox into public.agent_fix_queue
 */
import { withAuditWrapper } from "../_shared/audit.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-chatwoot-signature",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function inboxTypeFor(inboxId: number, payload: Record<string, unknown>): "support" | "bug" | "internal" {
  // Map Chatwoot inbox IDs -> our internal type. Configurable via env.
  const supportIds = (Deno.env.get("CHATWOOT_SUPPORT_INBOX_IDS") ?? "")
    .split(",").map((s) => Number(s.trim())).filter(Boolean);
  const bugIds = (Deno.env.get("CHATWOOT_BUG_INBOX_IDS") ?? "")
    .split(",").map((s) => Number(s.trim())).filter(Boolean);
  const internalIds = (Deno.env.get("CHATWOOT_INTERNAL_INBOX_IDS") ?? "")
    .split(",").map((s) => Number(s.trim())).filter(Boolean);
  if (bugIds.includes(inboxId)) return "bug";
  if (internalIds.includes(inboxId)) return "internal";
  if (supportIds.includes(inboxId)) return "support";
  // Fall back to label-based heuristic
  const labels = (payload.labels as string[] | undefined) ?? [];
  if (labels.some((l) => /bug/i.test(l))) return "bug";
  if (labels.some((l) => /internal|admin/i.test(l))) return "internal";
  return "support";
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

Deno.serve(withAuditWrapper("chatwoot-webhook", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("CHATWOOT_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook_secret_missing" }, 503);

  const raw = await req.text();
  const signature = req.headers.get("x-chatwoot-signature") ?? "";
  if (!signature) return json({ error: "unauthorized_webhook" }, 401);

  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json({ error: "unauthorized_webhook" }, 401);
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  const eventType = String(payload.event ?? "");
  const accountId = Number(((payload.account as Record<string, unknown> | undefined)?.id) ?? 0);
  const conversation = (eventType.startsWith("conversation")
    ? payload
    : (payload.conversation as Record<string, unknown> | undefined)) ?? payload;

  const conversationId = Number(conversation?.id ?? payload.id ?? 0);
  if (!conversationId) return json({ ok: true, skipped: "no_conversation_id" });

  const inboxId = Number(((conversation?.inbox as Record<string, unknown> | undefined)?.id)
    ?? conversation?.inbox_id ?? 0);
  const inboxType = inboxTypeFor(inboxId, conversation as Record<string, unknown>);
  const status = String((conversation?.status as string | undefined) ?? "open");
  const subject = String((conversation?.additional_attributes as Record<string, unknown> | undefined)?.subject
    ?? (conversation?.meta as Record<string, unknown> | undefined)?.subject
    ?? "");

  const contact = ((conversation?.meta as Record<string, unknown> | undefined)?.sender)
    ?? (payload.sender as Record<string, unknown> | undefined);
  const ownerIdentifier = (contact as Record<string, unknown> | undefined)?.identifier as string | undefined;
  const ownerUserId = isUuid(ownerIdentifier) ? ownerIdentifier : null;

  const messages = (conversation?.messages as Array<Record<string, unknown>> | undefined) ?? [];
  const lastMsg = messages[messages.length - 1] ?? (payload.message as Record<string, unknown> | undefined);
  const lastPreview = lastMsg ? String(lastMsg.content ?? "").slice(0, 280) : null;
  const lastMessageAt = lastMsg?.created_at
    ? new Date(Number(lastMsg.created_at) * 1000).toISOString()
    : new Date().toISOString();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const validStatuses = new Set(["open", "pending", "snoozed", "resolved"]);
  const safeStatus = validStatuses.has(status) ? status : "open";

  // Upsert ticket
  const { data: ticketRow, error: upsertErr } = await admin
    .from("tickets")
    .upsert({
      chatwoot_conversation_id: conversationId,
      chatwoot_account_id: accountId,
      chatwoot_inbox_id: inboxId,
      inbox_type: inboxType,
      owner_user_id: ownerUserId,
      owner_identifier: ownerIdentifier ?? null,
      subject,
      status: safeStatus,
      last_message_at: lastMessageAt,
      last_message_preview: lastPreview,
    }, { onConflict: "chatwoot_conversation_id" })
    .select("id, owner_user_id")
    .single();

  if (upsertErr) return json({ error: "upsert_failed", detail: upsertErr.message }, 500);

  // Append event
  await admin.from("ticket_events").insert({
    ticket_id: ticketRow.id,
    chatwoot_conversation_id: conversationId,
    event_type: eventType || "unknown",
    payload,
  });

  // Notify trainee on admin reply
  if (eventType === "message_created" && lastMsg) {
    const messageType = String(lastMsg.message_type ?? "");
    const senderType = String((lastMsg.sender as Record<string, unknown> | undefined)?.type ?? "");
    const isAdminReply = messageType === "outgoing" || senderType === "user" || senderType === "User";
    if (isAdminReply && ticketRow.owner_user_id) {
      await admin.from("notifications").insert({
        user_id: ticketRow.owner_user_id,
        title: "New reply on your support ticket",
        body_html: lastPreview ? `<p>${lastPreview.replace(/[<>&]/g, "")}</p>` : "<p>You have a new reply.</p>",
        notification_type: "ticket_reply",
        link_url: "/support",
      });
    }
  }

  // Route bug-inbox conversations into the triage queue
  if (inboxType === "bug" && eventType === "conversation_created") {
    const fingerprint = `chatwoot:bug:${conversationId}`;
    await admin.from("agent_fix_queue").upsert({
      fingerprint,
      event_type: "user_bug_report",
      source: "chatwoot",
      severity: "warn",
      error_message: subject || lastPreview || `Bug report #${conversationId}`,
      sample_trace_id: String(conversationId),
    }, { onConflict: "fingerprint" });
  }

  return json({ ok: true, ticket_id: ticketRow.id });
}));
