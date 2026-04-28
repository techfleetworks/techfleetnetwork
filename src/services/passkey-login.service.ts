import { startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import {
  getDeviceFingerprint,
  getDevicePublicKeySpkiBase64,
  isDeviceCryptoSupported,
  signDeviceNonce,
} from "@/lib/device-key";

const log = createLogger("PasskeyLoginService");

/**
 * Issues a fresh single-use nonce, signs it with the device's non-extractable
 * private key, and uploads everything for the server to verify. This is the
 * only way to mark a device trusted (or to renew its trust) — replacing the
 * old "random token in localStorage" scheme that was vulnerable to theft.
 */
async function bindCurrentDevice(): Promise<void> {
  if (!isDeviceCryptoSupported()) {
    log.warn("bindCurrentDevice", "WebCrypto/IndexedDB unavailable — skipping device binding");
    return;
  }
  // 1. Server hands us a fresh, single-use, AAL2-gated nonce.
  const { data: nonce, error: nonceErr } = await supabase.rpc(
    "issue_device_binding_nonce",
    { _purpose: "bind" },
  );
  if (nonceErr || typeof nonce !== "string") {
    throw new Error(nonceErr?.message || "Failed to start device binding");
  }
  // 2. Sign it inside the browser with the non-extractable private key.
  const [publicKey, fingerprint, signature] = await Promise.all([
    getDevicePublicKeySpkiBase64(),
    getDeviceFingerprint(),
    signDeviceNonce(nonce),
  ]);
  // 3. Upload public key + signature; server verifies and creates trust row.
  const { data, error } = await supabase.functions.invoke("device-bind", {
    body: { public_key: publicKey, fingerprint, signature, nonce },
  });
  if (error || !data?.bound) {
    throw new Error(error?.message || "Device binding failed");
  }
}

export const PasskeyLoginService = {
  async isCurrentSessionVerified(): Promise<boolean> {
    try {
      const sessionHash = await this.getCurrentSessionHash();
      if (!sessionHash) return false;

      const { data: sessionVerified, error: sessionError } = await supabase.rpc("is_passkey_login_verified", {
        _session_hash: sessionHash,
      });
      if (!sessionError && sessionVerified === true) return true;

      if (!isDeviceCryptoSupported()) return false;

      const fingerprint = await getDeviceFingerprint();
      const { data: active, error: activeErr } = await supabase.rpc("is_trusted_device_active", {
        _fingerprint: fingerprint,
      });
      if (activeErr || active !== true) return false;

      const { data: challenge, error: challengeErr } = await supabase.functions.invoke("device-prove?step=challenge", {
        body: {},
      });
      if (challengeErr || typeof challenge?.nonce !== "string") return false;

      const signature = await signDeviceNonce(challenge.nonce);
      const { data: proof, error: proofErr } = await supabase.functions.invoke("device-prove?step=verify", {
        body: { fingerprint, signature, nonce: challenge.nonce },
      });
      return !proofErr && proof?.trusted === true;
    } catch (e) {
      log.warn("isCurrentSessionVerified", `Trusted device proof failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  },

  async getCurrentSessionHash(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    let deviceBinding: { public_key: string; fingerprint: string; signature: string } | undefined;
    if (isDeviceCryptoSupported()) {
      try {
        const [publicKey, fingerprint, signature] = await Promise.all([
          getDevicePublicKeySpkiBase64(),
          getDeviceFingerprint(),
          signDeviceNonce(optsResp.challenge),
        ]);
        deviceBinding = { public_key: publicKey, fingerprint, signature };
      } catch (e) {
        log.warn("verify", `Device binding skipped after passkey success: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const { data, error } = await supabase.functions.invoke("passkey-auth-verify", {
      body: {
        response: assertion,
        ...(deviceBinding ? { device_binding: deviceBinding } : {}),
      },
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
      body: { token },
    });
    if (error || !data?.verified) {
      throw new Error(error?.message || "Recovery link is invalid or expired");
    }
    try {
      await bindCurrentDevice();
    } catch (e) {
      log.warn(
        "consumeRecoveryToken",
        `Device binding failed (recovery still consumed): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },

  /** Public helper used by post-MFA flows (e.g., TOTP) to bind a device. */
  bindCurrentDevice,
};
