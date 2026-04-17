// Validates a one-time recovery token and marks the current JWT session
// as passkey-verified (one-time bypass). Token is single-use.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const accessToken = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string" || token.length < 32) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tokenHash = await sha256Hex(token);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: rec } = await admin
      .from("passkey_recovery_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!rec || rec.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (rec.used_at) {
      return new Response(JSON.stringify({ error: "Token already used" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Token expired" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark token used (single-use)
    await admin.from("passkey_recovery_tokens").update({ used_at: new Date().toISOString() }).eq("id", rec.id);

    // Mark current JWT session verified
    const sessionHash = await sha256Hex(accessToken);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await admin.from("passkey_login_sessions").upsert({
      user_id: user.id,
      session_token_hash: sessionHash,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      ip_address: ip,
    }, { onConflict: "user_id,session_token_hash" });

    await admin.rpc("write_audit_log", {
      p_event_type: "admin_passkey_recovery_used",
      p_table_name: "passkey_recovery_tokens",
      p_record_id: rec.id,
      p_user_id: user.id,
      p_changed_fields: ["recovery_link"],
    });

    return new Response(JSON.stringify({ verified: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("passkey-recovery-verify error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
