// Verifies a WebAuthn assertion from an authenticated admin. On success,
// records the JWT session as passkey-verified for 8 hours.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@10.0.0";

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

    const body = await req.json();
    const { response, device_id } = body;
    if (!response?.id) {
      return new Response(JSON.stringify({ error: "Missing assertion" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (typeof device_id !== "string" || device_id.length < 16 || device_id.length > 256) {
      return new Response(JSON.stringify({ error: "Missing device id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load stored challenge
    const { data: chal } = await admin.from("passkey_login_challenges").select("challenge, expires_at").eq("user_id", user.id).maybeSingle();
    if (!chal || new Date(chal.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Challenge expired" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load matching credential
    const { data: cred } = await admin
      .from("passkey_credentials")
      .select("id, credential_id, public_key, counter, transports")
      .eq("user_id", user.id)
      .eq("credential_id", response.id)
      .maybeSingle();
    if (!cred) {
      return new Response(JSON.stringify({ error: "Unknown credential" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const origin = req.headers.get("origin") || "";
    const rpID = new URL(origin).hostname;

    const publicKeyBytes = Uint8Array.from(atob(cred.public_key), (c) => c.charCodeAt(0));

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: cred.credential_id,
        credentialPublicKey: publicKeyBytes,
        counter: cred.counter ?? 0,
        transports: (cred.transports ?? []) as AuthenticatorTransport[],
      },
    } as Parameters<typeof verifyAuthenticationResponse>[0]);

    if (!verification.verified) {
      return new Response(JSON.stringify({ error: "Verification failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update counter & last-used; clear challenge
    await admin.from("passkey_credentials").update({
      counter: verification.authenticationInfo?.newCounter ?? cred.counter,
      last_used_at: new Date().toISOString(),
    }).eq("id", cred.id);
    await admin.from("passkey_login_challenges").delete().eq("user_id", user.id);

    // Mark THIS DEVICE (not the rotating JWT) as passkey-verified for 30 days.
    // The hash is bound to (user_id + device_id) so JWT refreshes don't trigger
    // a re-prompt, and the device is forgotten after 30 days of inactivity or
    // when the user clears site data.
    const deviceHash = await sha256Hex(`v1:${user.id}:${device_id}`);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    await admin.from("passkey_login_sessions").upsert({
      user_id: user.id,
      session_token_hash: deviceHash,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + THIRTY_DAYS_MS).toISOString(),
      ip_address: ip,
    }, { onConflict: "user_id,session_token_hash" });

    // Audit
    await admin.rpc("write_audit_log", {
      p_event_type: "admin_passkey_login_verified",
      p_table_name: "passkey_login_sessions",
      p_record_id: user.id,
      p_user_id: user.id,
      p_changed_fields: ["passkey"],
    });

    return new Response(JSON.stringify({ verified: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("passkey-auth-verify error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
