import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashAccessTokenFromHeader(authHeader: string): Promise<string | null> {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function requireFreshAdminPasskey(
  admin: SupabaseClient,
  authHeader: string,
  userId: string,
  maxAgeMinutes = 10,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const sessionHash = await hashAccessTokenFromHeader(authHeader);
  if (!sessionHash) return { ok: false, status: 401, error: "Unauthorized" };

  const { data, error } = await admin
    .from("passkey_login_sessions")
    .select("verified_at, expires_at")
    .eq("user_id", userId)
    .eq("session_token_hash", sessionHash)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: "Unable to verify admin passkey status" };
  if (!data) return { ok: false, status: 403, error: "Fresh admin passkey verification required" };

  const verifiedAt = new Date(data.verified_at).getTime();
  const expiresAt = new Date(data.expires_at).getTime();
  const freshAfter = Date.now() - maxAgeMinutes * 60 * 1000;

  if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || verifiedAt < freshAfter) {
    return { ok: false, status: 403, error: "Fresh admin passkey verification required" };
  }

  return { ok: true };
}