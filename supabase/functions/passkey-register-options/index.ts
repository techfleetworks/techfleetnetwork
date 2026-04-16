import { createClient } from "npm:@supabase/supabase-js@2";
import { generateRegistrationOptions } from "npm:@simplewebauthn/server@10.0.0";

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
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: existing } = await admin.from("passkey_credentials").select("credential_id, transports").eq("user_id", user.id);

    const url = new URL(req.url);
    const origin = req.headers.get("origin") || `https://${url.hostname}`;
    const rpID = new URL(origin).hostname;

    const options = await generateRegistrationOptions({
      rpName: "Tech Fleet Network",
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email || user.id,
      attestationType: "none",
      excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: c.transports as AuthenticatorTransport[] })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });

    // Cache challenge in profiles? Use a short-lived table or memory? Use signed cookie via session storage on client.
    // For server-side challenge storage use a temp table keyed by user.
    await admin.from("passkey_credentials").delete().eq("user_id", user.id).eq("credential_id", `pending:${user.id}`);
    await admin.from("passkey_credentials").insert({
      user_id: user.id,
      credential_id: `pending:${user.id}`,
      public_key: options.challenge,
      device_name: "_pending_challenge",
    });

    return new Response(JSON.stringify(options), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("passkey-register-options error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
