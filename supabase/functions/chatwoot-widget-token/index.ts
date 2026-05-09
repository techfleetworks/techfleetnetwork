/**
 * chatwoot-widget-token — authenticated. Returns the HMAC identifier_hash
 * the Chatwoot JS SDK needs to embed the widget with verified identity.
 *
 *   POST { } -> { identifier, identifier_hash, name, email, attributes, baseUrl, websiteToken }
 *
 * The HMAC is computed server-side using CHATWOOT_HMAC_KEY so the client can
 * never forge another user's identity. The websiteToken is the public per-inbox
 * token; safe to return to the browser.
 */
import { withAuditWrapper } from "../_shared/audit.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

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

Deno.serve(withAuditWrapper("chatwoot-widget-token", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const baseUrl = Deno.env.get("CHATWOOT_BASE_URL") ?? "";
  const hmacKey = Deno.env.get("CHATWOOT_HMAC_KEY") ?? "";
  const websiteToken = Deno.env.get("CHATWOOT_WEBSITE_TOKEN") ?? "";
  if (!baseUrl || !hmacKey || !websiteToken) {
    return json({ error: "chatwoot_not_configured" }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  // Pull display fields from profiles for nicer Chatwoot identity.
  const { data: profile } = await userClient
    .from("profiles")
    .select("first_name,last_name,avatar_url,role")
    .eq("id", user.id)
    .maybeSingle();

  const identifier = user.id;
  const identifier_hash = createHmac("sha256", hmacKey).update(identifier).digest("hex");
  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
      (user.email ?? "Tech Fleet member")
    : (user.email ?? "Tech Fleet member");

  return json({
    baseUrl,
    websiteToken,
    identifier,
    identifier_hash,
    name,
    email: user.email ?? null,
    avatar_url: profile?.avatar_url ?? null,
    attributes: {
      role: profile?.role ?? "trainee",
    },
  });
}));
