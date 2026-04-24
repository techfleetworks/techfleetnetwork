import { startRegistration } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { PasskeyLoginService } from "@/services/passkey-login.service";

const log = createLogger("PasskeyService");

export interface PasskeyCredential {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

export const PasskeyService = {
  /** Returns true if WebAuthn is available in this browser. */
  isSupported(): boolean {
    return typeof window !== "undefined" && !!window.PublicKeyCredential;
  },

  /** List the current user's enrolled passkeys. */
  async list(userId: string): Promise<PasskeyCredential[]> {
    const { data, error } = await supabase
      .from("passkey_credentials")
      .select("id, device_name, created_at, last_used_at")
      .eq("user_id", userId)
      .neq("device_name", "_pending_challenge")
      .order("created_at", { ascending: false });
    if (error) {
      log.error("list", `Failed to list passkeys: ${error.message}`, undefined, error);
      throw new Error("Could not load passkeys");
    }
    return data ?? [];
  },

  /** Enroll a new passkey for the current user. */
  async enroll(deviceName?: string): Promise<void> {
    if (!this.isSupported()) throw new Error("Passkeys are not supported in this browser.");

    const { data: optsResp, error: optsErr } = await supabase.functions.invoke("passkey-register-options");
    if (optsErr || !optsResp) {
      log.error("enroll", `Failed to get registration options: ${optsErr?.message}`, undefined, optsErr);
      throw new Error("Failed to start passkey enrollment");
    }

    let attestation;
    try {
      // SimpleWebAuthn v10: pass the options object directly
      attestation = await startRegistration(optsResp);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn("enroll", `User cancelled or browser rejected passkey: ${msg}`);
      throw new Error("Passkey enrollment was cancelled");
    }

    const { data: verifyResp, error: verifyErr } = await supabase.functions.invoke("passkey-register-verify", {
      body: { response: attestation, deviceName: deviceName || "Passkey", device_id: getDeviceId() },
    });
    if (verifyErr || !verifyResp?.verified) {
      log.error("enroll", `Verification failed: ${verifyErr?.message}`, undefined, verifyErr);
      throw new Error("Passkey verification failed");
    }
    log.info("enroll", "Passkey enrolled successfully");
  },

  /** Delete a passkey credential. */
  async remove(credentialId: string): Promise<void> {
    const { error } = await supabase.from("passkey_credentials").delete().eq("id", credentialId);
    if (error) {
      log.error("remove", `Failed to delete passkey: ${error.message}`, undefined, error);
      throw new Error("Could not remove passkey");
    }
  },
};
