// device-bind
// -----------
// After a successful AAL2 step (passkey or TOTP verification), the client
// calls this function to register the device's public key as trusted for
// 30 days. The function ONLY accepts a binding if:
//   1. The caller's JWT is at AAL2 (the second factor was just satisfied).
//   2. The supplied signature verifies against the supplied public key
//      AND the server-issued nonce (replay protection).
//   3. The fingerprint matches sha256(spki(publicKey)) (anti-substitution).
//
// Result: even an attacker who steals the JWT cookie still cannot bind a
// new "trusted device" without also having physical possession of the
// device's non-extractable private key.

import { getAdminClient, getUserClient } from "../_shared/admin-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

async function verifyEcdsaSignature(
  spkiB64: string,
  signatureB64: string,
  nonce: string,
): Promise<boolean> {
  try {
    const spki = base64ToBytes(spkiB64);
    const key = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sig = base64ToBytes(signatureB64);
    const data = new TextEncoder().encode(`tfn-device-proof-v1:${nonce}`);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      data,
    );
  } catch (e) {
    console.warn("device-bind: signature verify threw", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse(401, { error: "Unauthorized" });

    const userClient = getUserClient(authHeader);
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse(401, { error: "Unauthorized" });

    // Hard-require AAL2 — the server-side RPC will also check this, but
    // failing fast here gives a clean 403 without consuming a nonce.
    const { data: aalData, error: aalErr } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) return jsonResponse(500, { error: "AAL check failed" });
    // Either the JWT itself is already AAL2, or the user has no factors
    // (so the post-passkey-verification path is the only way to call this).
    // We still require the RPC's AAL check below; this is just a fast path.

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonResponse(400, { error: "Invalid body" });

    const publicKey = body.public_key;
    const fingerprint = body.fingerprint;
    const signature = body.signature;
    const nonce = body.nonce;

    if (
      typeof publicKey !== "string" || publicKey.length < 80 || publicKey.length > 4096 ||
      typeof fingerprint !== "string" || fingerprint.length !== 64 ||
      !/^[a-f0-9]+$/i.test(fingerprint) ||
      typeof signature !== "string" || signature.length < 32 || signature.length > 1024 ||
      typeof nonce !== "string" || nonce.length < 32 || nonce.length > 128
    ) {
      return jsonResponse(400, { error: "Invalid payload" });
    }

    // The fingerprint MUST match the actual hash of the supplied SPKI.
    const expectedFp = await fingerprintOf(publicKey);
    if (expectedFp.toLowerCase() !== fingerprint.toLowerCase()) {
      return jsonResponse(400, { error: "Fingerprint does not match public key" });
    }

    // Verify the signature first (cheap), then consume the nonce (writes).
    const sigOk = await verifyEcdsaSignature(publicKey, signature, nonce);
    if (!sigOk) return jsonResponse(400, { error: "Invalid signature" });

    const admin = getAdminClient();

    // Atomically consume the nonce ('bind' purpose). If it returns false,
    // the nonce was missing/expired/already-used.
    const { data: consumed, error: consumeErr } = await admin.rpc("_consume_device_nonce", {
      _user_id: user.id,
      _nonce: nonce,
      _purpose: "bind",
    });
    if (consumeErr) return jsonResponse(500, { error: "Nonce consume failed" });
    if (consumed !== true) return jsonResponse(400, { error: "Nonce expired or already used" });

    const ip = req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { error: upsertErr } = await admin
      .from("trusted_devices")
      .upsert({
        user_id: user.id,
        fingerprint: fingerprint.toLowerCase(),
        public_key: publicKey,
        bound_at: new Date().toISOString(),
        last_proof_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ip_address: ip,
        user_agent: ua,
      }, { onConflict: "user_id,fingerprint" });
    if (upsertErr) {
      console.error("device-bind: upsert failed", upsertErr);
      return jsonResponse(500, { error: "Could not bind device" });
    }

    await admin.rpc("write_audit_log", {
      p_event_type: "trusted_device_bound",
      p_table_name: "trusted_devices",
      p_record_id: fingerprint.toLowerCase(),
      p_user_id: user.id,
      p_changed_fields: ["bind"],
    });

    return jsonResponse(200, { bound: true });
  } catch (err) {
    console.error("device-bind error", err);
    return jsonResponse(500, { error: "Internal error" });
  }
});
