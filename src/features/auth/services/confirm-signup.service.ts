/**
 * AUTH-CONFIRM-SIGNUP (ADR-0064) — single owner of new-account email
 * confirmation via GoTrue OTP. Mirrors `verifyRecoveryOtp` on the session port.
 *
 * Two proofs, both server-verified by GoTrue (random, hashed-at-rest,
 * single-use, expiring, rate-limited — we never mint or store codes ourselves):
 *   - code       — the 6-digit OTP the human types: verifyOtp({ email, token, type:'signup' })
 *   - token_hash — from the inert /auth/confirm landing's button (ADR-0064):
 *                  verifyOtp({ token_hash, type:'signup' })
 *
 * On success GoTrue returns a session and the SDK persists it, so the caller is
 * signed in — no URL-token parsing (client has detectSessionInUrl:false). The
 * raw code / token_hash is NEVER logged (secret hygiene, OWASP).
 */
import { supabase } from "@/integrations/supabase/client";

/** Confirm by the 6-digit code the member typed. */
export function confirmSignupByCode(email: string, token: string) {
  return supabase.auth.verifyOtp({ email, token, type: "signup" });
}

/** Confirm by the token_hash carried on the inert /auth/confirm landing. */
export function confirmSignupByTokenHash(tokenHash: string) {
  return supabase.auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
}
