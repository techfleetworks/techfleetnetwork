// Generates WebAuthn assertion options for an authenticated admin to verify
// their passkey at login. Stores the challenge server-side keyed by user.
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@10.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify admin role
    const { count: roleCount } = await admin.from("user_roles").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "admin");
    if ((roleCount ?? 0) === 0) {
      return new Response(JSON.stringify({ error: "Not an admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: creds } = await admin
      .from("passkey_credentials")
      .select("credential_id, transports")
      .eq("user_id", user.id)
      .neq("device_name", "_pending_challenge");

    if (!creds || creds.length === 0) {
      return new Response(JSON.stringify({ error: "No passkeys enrolled" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const origin = req.headers.get("origin") || `https://${url.hostname}`;
    const rpID = new URL(origin).hostname;

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({
        id: c.credential_id,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
      userVerification: "required",
    });

    // Store challenge server-side, keyed by user (one per user, replaced)
    await admin.from("passkey_login_challenges").upsert({
      user_id: user.id,
      challenge: options.challenge,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    return new Response(JSON.stringify(options), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("passkey-auth-options error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
