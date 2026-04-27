// Verifies a WebAuthn assertion from an authenticated admin on every new login session.
//
// Migrated to use the centralized admin-client wrapper (rotation-aware) so
// that rotating the SUPABASE_SERVICE_ROLE_KEY does not require a code edit
// to this critical security path.
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@10.0.0";
import { getAdminClient, getUserClient } from "../_shared/admin-client.ts";
import { isElevatedUser } from "../_shared/elevated-roles.ts";

const TRUST_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fingerprintOf(spkiB64: string): Promise<string> {
  const spki = base64ToBytes(spkiB64);
  const hash = await crypto.subtle.digest("SHA-256", spki);
  return bytesToHex(new Uint8Array(hash));
}

async function verifyDeviceSignature(spkiB64: string, signatureB64: string, challenge: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      base64ToBytes(spkiB64),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`tfn-device-proof-v1:${challenge}`);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64ToBytes(signatureB64),
      data,
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = getUserClient(authHeader);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!(await isElevatedUser(user.id))) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { response, device_binding } = body;
    if (!response?.id) {
      return new Response(JSON.stringify({ error: "Missing assertion" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (
      !device_binding ||
      typeof device_binding.public_key !== "string" || device_binding.public_key.length < 80 || device_binding.public_key.length > 4096 ||
      typeof device_binding.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(device_binding.fingerprint) ||
      typeof device_binding.signature !== "string" || device_binding.signature.length < 32 || device_binding.signature.length > 1024
    ) {
      return new Response(JSON.stringify({ error: "Missing device binding" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = getAdminClient();

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
      requireUserVerification: true,
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

    const expectedFingerprint = await fingerprintOf(device_binding.public_key);
    if (expectedFingerprint.toLowerCase() !== device_binding.fingerprint.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Device binding mismatch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const deviceSignatureOk = await verifyDeviceSignature(device_binding.public_key, device_binding.signature, chal.challenge);
    if (!deviceSignatureOk) {
      return new Response(JSON.stringify({ error: "Device binding failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update counter & last-used; clear challenge
    await admin.from("passkey_credentials").update({
      counter: verification.authenticationInfo?.newCounter ?? cred.counter,
      last_used_at: new Date().toISOString(),
    }).eq("id", cred.id);
    await admin.from("passkey_login_challenges").delete().eq("user_id", user.id);

    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;
    const accessToken = authHeader.slice(7).trim();
    const sessionDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
    const sessionTokenHash = Array.from(new Uint8Array(sessionDigest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const verifiedAt = new Date().toISOString();
    await admin.from("trusted_devices").upsert({
      user_id: user.id,
      fingerprint: device_binding.fingerprint.toLowerCase(),
      public_key: device_binding.public_key,
      bound_at: verifiedAt,
      last_proof_at: verifiedAt,
      expires_at: new Date(Date.now() + TRUST_DURATION_MS).toISOString(),
      ip_address: ip,
      user_agent: ua,
    }, { onConflict: "user_id,fingerprint" });

    await admin.from("passkey_login_sessions").upsert({
      user_id: user.id,
      session_token_hash: sessionTokenHash,
      verified_at: verifiedAt,
      expires_at: new Date(Date.now() + TRUST_DURATION_MS).toISOString(),
      ip_address: ip,
    }, { onConflict: "user_id,session_token_hash" });

    // Audit
    await admin.rpc("write_audit_log", {
      p_event_type: "admin_passkey_login_verified",
      p_table_name: "passkey_credentials",
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
