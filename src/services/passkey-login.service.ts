import { startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { getDeviceId, getDeviceVerificationHash } from "@/lib/device-id";

const log = createLogger("PasskeyLoginService");

export const PasskeyLoginService = {
  /**
   * Returns true if THIS device has already passed the passkey gate within
   * the 30-day trust window. Verification is bound to a stable per-device id
   * (not the rotating JWT) so token refreshes don't trigger a re-prompt.
   */
  async isCurrentSessionVerified(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const hash = await getDeviceVerificationHash(user.id);
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
      body: { response: assertion, device_id: getDeviceId() },
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

  /** Consumes a recovery token (from the email link) to mark this device verified. */
  async consumeRecoveryToken(token: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke("passkey-recovery-verify", {
      body: { token, device_id: getDeviceId() },
    });
    if (error || !data?.verified) {
      throw new Error(error?.message || "Recovery link is invalid or expired");
    }
  },
};
