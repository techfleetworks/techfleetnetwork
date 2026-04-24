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

/**
 * Asks the server to challenge this device, signs the challenge, and submits
 * the proof. Used to upgrade the cheap "trust row exists" check into a
 * cryptographic guarantee that THIS browser still controls the matching
 * private key (so a stolen session cookie on another machine cannot pass).
 */
async function proveCurrentDevice(): Promise<boolean> {
  if (!isDeviceCryptoSupported()) return false;
  try {
    const { data: chalResp, error: chalErr } = await supabase.functions.invoke(
      "device-prove?step=challenge",
    );
    if (chalErr || !chalResp?.nonce) return false;
    const nonce: string = chalResp.nonce;
    const [fingerprint, signature] = await Promise.all([
      getDeviceFingerprint(),
      signDeviceNonce(nonce),
    ]);
    const { data, error } = await supabase.functions.invoke(
      "device-prove?step=verify",
      { body: { fingerprint, signature, nonce } },
    );
    if (error || !data?.trusted) return false;
    return true;
  } catch (e) {
    log.warn("proveCurrentDevice", `Proof failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export const PasskeyLoginService = {
  /**
   * Returns true ONLY when:
   *   1. A trusted_devices row exists for this (user, device fingerprint),
   *      is unexpired, AND
   *   2. The browser can still sign a fresh server nonce with the
   *      matching non-extractable private key.
   *
   * This means a stolen session cookie cannot satisfy the gate from a
   * different browser/device.
   */
  async isCurrentSessionVerified(): Promise<boolean> {
    if (!isDeviceCryptoSupported()) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    let fingerprint: string;
    try {
      fingerprint = await getDeviceFingerprint();
    } catch {
      return false;
    }
    const { data: active, error } = await supabase.rpc("is_trusted_device_active", {
      _fingerprint: fingerprint,
    });
    if (error) {
      log.warn("isCurrentSessionVerified", `RPC failed: ${error.message}`);
      return false;
    }
    if (active !== true) return false;
    // The cheap row check passed — now demand a cryptographic proof to
    // ensure this is the same physical device, not just a session replay.
    return await proveCurrentDevice();
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
    // The passkey edge function elevates the session to AAL2 (the WebAuthn
    // assertion is the second factor). We can now bind this device for 30
    // days using the cryptographic scheme.
    try {
      await bindCurrentDevice();
    } catch (e) {
      log.warn(
        "verify",
        `Device binding failed (passkey still verified): ${e instanceof Error ? e.message : String(e)}`,
      );
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
