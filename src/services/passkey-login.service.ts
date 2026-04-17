import { startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("PasskeyLoginService");

/**
 * Computes a SHA-256 hex digest of the current access token.
 * Used to look up whether THIS JWT session has already completed
 * the passkey login gate.
 */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const PasskeyLoginService = {
  /** Returns true if the current JWT session has already passed the passkey gate. */
  async isCurrentSessionVerified(): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const hash = await sha256Hex(session.access_token);
    const { data, error } = await supabase.rpc("is_passkey_login_verified", { _session_hash: hash });
    if (error) {
      log.warn("isCurrentSessionVerified", `RPC failed: ${error.message}`);
      return false;
    }
    return data === true;
  },

  /** Performs the full WebAuthn assertion flow against the admin's enrolled passkey. */
  async verify(): Promise<void> {
    const { data: optsResp, error: optsErr } = await supabase.functions.invoke("passkey-auth-options");
    if (optsErr || !optsResp) {
      throw new Error(optsErr?.message || "Failed to start passkey verification");
    }

    let assertion;
    try {
      assertion = await startAuthentication(optsResp);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn("verify", `User cancelled or browser rejected: ${msg}`);
      throw new Error("Passkey verification was cancelled");
    }

    const { data, error } = await supabase.functions.invoke("passkey-auth-verify", {
      body: { response: assertion },
    });
    if (error || !data?.verified) {
      throw new Error(error?.message || "Passkey verification failed");
    }
  },

  /** Sends a one-time recovery email to the admin's registered email address. */
  async requestRecoveryEmail(): Promise<void> {
    const { data, error } = await supabase.functions.invoke("passkey-recovery-request");
    if (error || !data?.sent) {
      throw new Error(error?.message || "Failed to send recovery email");
    }
  },

  /** Consumes a recovery token (from the email link) to mark the session verified. */
  async consumeRecoveryToken(token: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke("passkey-recovery-verify", {
      body: { token },
    });
    if (error || !data?.verified) {
      throw new Error(error?.message || "Recovery link is invalid or expired");
    }
  },
};
