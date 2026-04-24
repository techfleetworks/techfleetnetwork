// device-prove
// ------------
// Proves that the live browser still holds the private key bound to a
// trusted_devices row. The client has already verified (via RLS-readable
// is_trusted_device_active) that the row is unexpired; this endpoint
// raises that to a cryptographic guarantee by:
//   1. Issuing a fresh single-use nonce (purpose='proof').
//   2. Receiving a signature over that nonce.
//   3. Verifying the signature against the stored public key.
//
// Successful proof bumps `last_proof_at`. Failure is silent w.r.t. the
// trust row — we don't delete it on a single failure to avoid
// denial-of-service via flooding bad signatures.
//
// Two endpoints in one function for simplicity:
//   POST /device-prove?step=challenge → { nonce }
//   POST /device-prove?step=verify    → { fingerprint, signature, nonce } → { trusted: true }

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
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse(401, { error: "Unauthorized" });

    const userClient = getUserClient(authHeader);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return jsonResponse(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const step = url.searchParams.get("step") || "challenge";
    const admin = getAdminClient();

    if (step === "challenge") {
      // The RPC enforces rate limits + ownership.
      const { data: nonce, error: nonceErr } = await userClient.rpc("issue_device_binding_nonce", {
        _purpose: "proof",
      });
      if (nonceErr || typeof nonce !== "string") {
        return jsonResponse(429, { error: nonceErr?.message || "Could not issue nonce" });
      }
      return jsonResponse(200, { nonce });
    }

    if (step === "verify") {
      const body = await req.json().catch(() => null);
      if (!body) return jsonResponse(400, { error: "Invalid body" });
      const fingerprint = body.fingerprint;
      const signature = body.signature;
      const nonce = body.nonce;
      if (
        typeof fingerprint !== "string" || fingerprint.length !== 64 ||
        !/^[a-f0-9]+$/i.test(fingerprint) ||
        typeof signature !== "string" || signature.length < 32 || signature.length > 1024 ||
        typeof nonce !== "string" || nonce.length < 32 || nonce.length > 128
      ) {
        return jsonResponse(400, { error: "Invalid payload" });
      }

      // Look up the trusted device row (must exist, must be unexpired, must
      // belong to this user).
      const { data: row } = await admin
        .from("trusted_devices")
        .select("id, public_key, expires_at")
        .eq("user_id", user.id)
        .eq("fingerprint", fingerprint.toLowerCase())
        .maybeSingle();
      if (!row) return jsonResponse(403, { error: "Device not trusted" });
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        return jsonResponse(403, { error: "Trust expired" });
      }

      // Verify the signature against the stored public key first…
      const sigOk = await verifyEcdsaSignature(row.public_key, signature, nonce);
      if (!sigOk) return jsonResponse(400, { error: "Invalid signature" });

      // …then consume the nonce (single-use).
      const { data: consumed } = await admin.rpc("_consume_device_nonce", {
        _user_id: user.id,
        _nonce: nonce,
        _purpose: "proof",
      });
      if (consumed !== true) return jsonResponse(400, { error: "Nonce expired or already used" });

      await admin
        .from("trusted_devices")
        .update({ last_proof_at: new Date().toISOString() })
        .eq("id", row.id);

      return jsonResponse(200, { trusted: true });
    }

    return jsonResponse(400, { error: "Unknown step" });
  } catch (err) {
    console.error("device-prove error", err);
    return jsonResponse(500, { error: "Internal error" });
  }
});
