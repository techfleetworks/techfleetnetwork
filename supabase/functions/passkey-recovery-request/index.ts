// Sends an admin a one-time recovery link they can use to bypass the
// passkey gate for the current session if they can't access their passkey.
// Rate-limited to prevent abuse.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !user.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify admin
    const { count: roleCount } = await admin.from("user_roles").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "admin");
    if ((roleCount ?? 0) === 0) {
      return new Response(JSON.stringify({ error: "Not an admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate limit: max 3 requests / hour per user
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_identifier: `passkey-recovery:${user.id}`,
      p_action: "passkey_recovery_request",
      p_max_attempts: 3,
      p_window_minutes: 60,
      p_block_minutes: 60,
    });
    if (rl && (rl as { allowed: boolean }).allowed === false) {
      return new Response(JSON.stringify({ error: "Too many recovery requests. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Generate token, store hash
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    await admin.from("passkey_recovery_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      ip_address: ip,
    });

    // Build recovery URL
    const origin = req.headers.get("origin") || "https://techfleetnetwork.lovable.app";
    const recoveryUrl = `${origin}/admin-recovery?token=${token}`;

    // Get profile for personalization
    const { data: profile } = await admin.from("profiles").select("first_name").eq("user_id", user.id).maybeSingle();

    // Send email via existing transactional pipeline
    const { error: emailErr } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "admin-passkey-recovery",
        recipientEmail: user.email,
        idempotencyKey: `passkey-recovery-${tokenHash.substring(0, 16)}`,
        templateData: {
          firstName: profile?.first_name || "Admin",
          recoveryUrl,
          ipAddress: ip,
        },
      },
    });

    if (emailErr) {
      console.error("passkey-recovery-request: email send failed", emailErr);
      return new Response(JSON.stringify({ error: "Failed to send recovery email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Audit
    await admin.rpc("write_audit_log", {
      p_event_type: "admin_passkey_recovery_requested",
      p_table_name: "passkey_recovery_tokens",
      p_record_id: user.id,
      p_user_id: user.id,
      p_changed_fields: [ip],
    });

    return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("passkey-recovery-request error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
