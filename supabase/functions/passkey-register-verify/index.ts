import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@10.0.0";

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

    const body = await req.json();
    const { response, deviceName, device_id } = body;
    if (!response) {
      return new Response(JSON.stringify({ error: "Missing response" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // device_id is optional for backwards compat with older clients, but if
    // present it must be a sane length so we don't store junk.
    if (device_id !== undefined && (typeof device_id !== "string" || device_id.length < 16 || device_id.length > 256)) {
      return new Response(JSON.stringify({ error: "Invalid device id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pending } = await admin.from("passkey_credentials").select("public_key").eq("user_id", user.id).eq("credential_id", `pending:${user.id}`).maybeSingle();
    if (!pending) {
      return new Response(JSON.stringify({ error: "No pending registration" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const origin = req.headers.get("origin") || "";
    const rpID = new URL(origin).hostname;

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.public_key,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: "Verification failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SimpleWebAuthn v10: registrationInfo exposes credential fields directly,
    // but newer patch versions wrap them under `credential`. Support both shapes.
    const info = verification.registrationInfo as {
      credentialID?: Uint8Array | string;
      credentialPublicKey?: Uint8Array;
      counter?: number;
      credential?: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] };
    };
    const credentialId: string =
      info.credential?.id ??
      (typeof info.credentialID === "string"
        ? info.credentialID
        : info.credentialID
          ? btoa(String.fromCharCode(...info.credentialID))
          : "");
    const publicKeyBytes: Uint8Array | undefined =
      info.credential?.publicKey ?? info.credentialPublicKey;
    const counter: number = info.credential?.counter ?? info.counter ?? 0;
    const transports: string[] = info.credential?.transports ?? (response.response?.transports ?? []);

    if (!credentialId || !publicKeyBytes) {
      console.error("passkey-register-verify: missing credential fields", { info });
      return new Response(JSON.stringify({ error: "Verification returned incomplete credential" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("passkey_credentials").delete().eq("user_id", user.id).eq("credential_id", `pending:${user.id}`);
    const { error: insertErr } = await admin.from("passkey_credentials").insert({
      user_id: user.id,
      credential_id: credentialId,
      public_key: btoa(String.fromCharCode(...publicKeyBytes)),
      counter,
      transports,
      device_name: deviceName || "Passkey",
    });
    if (insertErr) {
      console.error("passkey-register-verify insert failed", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark THIS DEVICE (not the rotating JWT) as having passed the second
    // factor for 30 days. The act of completing a WebAuthn registration
    // ceremony is a stronger user-presence proof than the gate's separate
    // authentication assertion, so it is safe to bridge the just-completed
    // registration to a verified-device marker. This avoids the bug where
    // a freshly-enrolled admin gets re-prompted seconds later, AND keeps
    // them un-prompted on the same device for the full 30-day trust window.
    if (typeof device_id === "string" && device_id.length >= 16) {
      try {
        const hashBuf = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(`v1:${user.id}:${device_id}`),
        );
        const deviceHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const ip =
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          null;
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        await admin.from("passkey_login_sessions").upsert(
          {
            user_id: user.id,
            session_token_hash: deviceHash,
            verified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + THIRTY_DAYS_MS).toISOString(),
            ip_address: ip,
          },
          { onConflict: "user_id,session_token_hash" },
        );
      } catch (sessErr) {
        // Non-fatal: enrollment still succeeded; user will just see the gate
        // dialog once and verify with the new passkey.
        console.warn("passkey-register-verify: could not bridge verified session", sessErr);
      }
    }

    return new Response(JSON.stringify({ verified: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("passkey-register-verify error", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
