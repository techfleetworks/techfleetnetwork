/**
 * submit-dispute — T&C §20. Captures an informal-resolution request and
 * starts the 30-day clock. Public endpoint (a user may dispute without an
 * active session). Email is required and validated.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clientIp } from "../_shared/compliance.ts";

interface Body {
  email?: string;
  full_name?: string;
  summary?: string;
  category?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Body = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const email = (body.email || "").trim().toLowerCase().slice(0, 255);
  const summary = (body.summary || "").trim();
  if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 400);
  if (summary.length < 20 || summary.length > 8000) return json({ error: "invalid_summary" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("authorization");
  const client = createClient(url, anonKey, {
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    auth: { persistSession: false },
  });

  const { data: id, error } = await client.rpc("submit_dispute", {
    p_email: email,
    p_full_name: (body.full_name || "").slice(0, 255) || null,
    p_summary: summary,
    p_category: (body.category || "").slice(0, 64) || null,
    p_ip: clientIp(req),
  });
  if (error) return json({ error: error.message }, 500);

  // Best-effort notification to legal alias.
  client.from("transactional_email_queue").insert({
    to_email: "info@techfleet.network",
    subject: `[dispute-intake] New informal dispute from ${email}`,
    template: "plain",
    payload: {
      body: `Category: ${body.category || "(unspecified)"}\nFrom: ${body.full_name || "(no name)"} <${email}>\n\n${summary}\n\nDispute id: ${id}\n30-day clock starts now.`,
    },
    idempotency_key: `dispute-${id}`,
  }).then(() => null).catch(() => null);

  return json({ ok: true, id });
});
