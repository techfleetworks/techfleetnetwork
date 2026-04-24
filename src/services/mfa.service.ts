import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { PasskeyLoginService } from "@/services/passkey-login.service";
const log = createLogger("MfaService");

export interface TotpFactor {
  id: string;
  friendly_name?: string;
  factor_type: "totp" | "phone";
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
}

export interface EnrollTotpResult {
  factorId: string;
  qrCode: string; // SVG data URI
  secret: string; // Base32 secret for manual entry
  uri: string; // otpauth:// URI
}

/**
 * Industry-standard TOTP MFA service.
 * Uses Supabase's built-in auth.mfa API (RFC 6238 compliant).
 * Compatible with Google Authenticator, Authy, 1Password, Microsoft Authenticator, etc.
 */
export const MfaService = {
  /** List all enrolled MFA factors for the current user. */
  async listFactors(): Promise<TotpFactor[]> {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      log.error("listFactors", `Failed: ${error.message}`, undefined, error);
      throw new Error("Could not load MFA factors");
    }
    return (data?.all ?? []) as TotpFactor[];
  },

  /** Begin TOTP enrollment. Returns QR code + secret to display to the user. */
  async enrollTotp(friendlyName: string): Promise<EnrollTotpResult> {
    // Clean up any prior unverified factors with the same name to avoid conflicts
    const existing = await this.listFactors();
    for (const f of existing) {
      if (f.factor_type === "totp" && f.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: friendlyName || `Authenticator ${new Date().toLocaleDateString()}`,
    });
    if (error || !data) {
      log.error("enrollTotp", `Failed: ${error?.message}`, undefined, error);
      throw new Error(error?.message || "Failed to start MFA enrollment");
    }
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  },

  /** Verify the 6-digit code from the authenticator app to activate the factor. */
  async verifyEnrollment(factorId: string, code: string): Promise<void> {
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challengeData) {
      log.error("verifyEnrollment", `Challenge failed: ${challengeErr?.message}`, undefined, challengeErr);
      throw new Error("Failed to create challenge");
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code.replace(/\s/g, ""),
    });
    if (verifyErr) {
      log.warn("verifyEnrollment", `Invalid code: ${verifyErr.message}`);
      throw new Error("Invalid verification code. Please try again.");
    }
    log.info("verifyEnrollment", "TOTP factor enrolled successfully");
  },

  /** Remove an MFA factor. */
  async unenroll(factorId: string): Promise<void> {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      log.error("unenroll", `Failed: ${error.message}`, undefined, error);
      throw new Error("Could not remove MFA factor");
    }
    log.info("unenroll", "MFA factor removed");
  },

  /**
   * Check if the current session needs an MFA challenge.
   *
   * Defensive: Supabase's `getAuthenticatorAssuranceLevel` can briefly report
   * `nextLevel: "aal2"` based on stale JWT/AMR claims even when the user has
   * NO verified factors enrolled (e.g., right after a factor is removed, or
   * during a freshly-issued session for a user who has never enrolled). If we
   * trusted that flag alone we would prompt new users for a code they cannot
   * produce. We therefore cross-check `listFactors()` and only return
   * `needsChallenge: true` when at least one verified TOTP factor exists.
   */
  async getAssuranceLevel(): Promise<{ currentLevel: string | null; nextLevel: string | null; needsChallenge: boolean }> {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      log.error("getAssuranceLevel", `Failed: ${error.message}`, undefined, error);
      return { currentLevel: null, nextLevel: null, needsChallenge: false };
    }
    const aalSaysChallenge = data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
    let needsChallenge = false;
    if (aalSaysChallenge) {
      try {
        const factors = await this.listFactors();
        const hasVerifiedTotp = factors.some(
          (f) => f.factor_type === "totp" && f.status === "verified",
        );
        needsChallenge = hasVerifiedTotp;
        if (!hasVerifiedTotp) {
          log.warn(
            "getAssuranceLevel",
            "AAL reported aal1→aal2 but no verified TOTP factor exists — suppressing spurious challenge",
          );
        }
      } catch (e) {
        // If we can't list factors, fail closed (don't prompt) rather than
        // showing a dialog with no factor — that's the worse UX.
        log.warn(
          "getAssuranceLevel",
          `listFactors check failed (suppressing challenge): ${e instanceof Error ? e.message : String(e)}`,
        );
        needsChallenge = false;
      }
    }
    return {
      currentLevel: data?.currentLevel ?? null,
      nextLevel: data?.nextLevel ?? null,
      needsChallenge,
    };
  },


  /** Pre-create a challenge so the user's verify is a single round-trip. */
  async createChallenge(factorId: string): Promise<string> {
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error || !data) throw new Error("Failed to create MFA challenge");
    return data.id;
  },

  /** Verify a previously created challenge with the user's 6-digit code. */
  async verifyChallenge(factorId: string, challengeId: string, code: string): Promise<void> {
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.replace(/\s/g, ""),
    });
    if (error) {
      log.warn("verifyChallenge", `Invalid code: ${error.message}`);
      throw new Error("Invalid verification code. Please try again.");
    }
    log.info("verifyChallenge", "MFA challenge passed — session elevated to AAL2");
    // Mark THIS device trusted for 30 days so the same device is not asked
    // again for either passkey or TOTP within the window. The RPC requires
    // the caller's JWT to already be at AAL2, which is true at this point.
    await this.markDeviceTrusted();
  },

  /** Submit a 6-digit code during login to elevate the session to AAL2. */
  async challengeAndVerify(factorId: string, code: string): Promise<void> {
    const challengeId = await this.createChallenge(factorId);
    await this.verifyChallenge(factorId, challengeId, code);
  },

  /**
   * After a successful TOTP verification, the JWT is at AAL2. Use the
   * cryptographic device-binding scheme (non-extractable WebCrypto key in
   * IndexedDB) to mark this physical device trusted for 30 days. Best
   * effort: failures fall through to "user gets re-prompted next visit",
   * which is the safe failure mode.
   */
  async markDeviceTrusted(): Promise<void> {
    try {
      await PasskeyLoginService.bindCurrentDevice();
    } catch (e) {
      log.warn(
        "markDeviceTrusted",
        `Device binding failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
};
