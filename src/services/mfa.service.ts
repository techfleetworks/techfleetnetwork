import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { isValidTotpCode } from "@/lib/security";
const log = createLogger("MfaService");

const MFA_RETRY_DELAYS_MS = [200, 500, 900] as const;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeFriendlyName = (friendlyName: string) => {
  const normalized = friendlyName.replace(/\s+/g, " ").trim();
  return normalized || `Authenticator ${new Date().toLocaleDateString()}`;
};

const isDuplicateFriendlyNameError = (message = "") => /factor.*friendly name.*already exists/i.test(message);

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
    let lastError: unknown;
    for (let attempt = 0; attempt < MFA_RETRY_DELAYS_MS.length; attempt += 1) {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!error) return (data?.all ?? []) as TotpFactor[];
      lastError = error;
      log.warn("listFactors", `Attempt ${attempt + 1} failed: ${error.message}`);
      if (attempt < MFA_RETRY_DELAYS_MS.length - 1) await wait(MFA_RETRY_DELAYS_MS[attempt]);
    }
    log.error("listFactors", "Failed after retries", undefined, lastError);
    throw new Error("Could not load 2FA methods. Please retry in a moment.");
  },

  /** Remove incomplete TOTP setup attempts so retries never collide with stale friendly names. */
  async cleanupPendingTotp(friendlyName?: string): Promise<number> {
    const normalizedName = friendlyName ? normalizeFriendlyName(friendlyName) : null;
    const existing = await this.listFactors();
    const staleFactors = existing.filter((factor) => {
      if (factor.factor_type !== "totp" || factor.status !== "unverified") return false;
      if (!normalizedName) return true;
      return (factor.friendly_name || "") === normalizedName;
    });

    let removed = 0;
    for (const factor of staleFactors) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) {
        log.warn("cleanupPendingTotp", `Could not remove stale factor ${factor.id}: ${error.message}`);
      } else {
        removed += 1;
      }
    }
    return removed;
  },

  /** Begin TOTP enrollment. Returns QR code + secret to display to the user. */
  async enrollTotp(friendlyName: string): Promise<EnrollTotpResult> {
    const normalizedName = normalizeFriendlyName(friendlyName);
    await this.cleanupPendingTotp(normalizedName);

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: normalizedName,
    });
    if (error || !data) {
      if (isDuplicateFriendlyNameError(error?.message)) {
        await this.cleanupPendingTotp(normalizedName);
        const retry = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: normalizedName });
        if (!retry.error && retry.data) {
          return {
            factorId: retry.data.id,
            qrCode: retry.data.totp.qr_code,
            secret: retry.data.totp.secret,
            uri: retry.data.totp.uri,
          };
        }
      }
      log.error("enrollTotp", `Failed: ${error?.message}`, undefined, error);
      throw new Error("Could not start 2FA setup. Please retry in a moment.");
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
    const normalizedCode = code.replace(/\s/g, "");
    if (!isValidTotpCode(normalizedCode)) throw new Error("Enter the 6-digit code from your authenticator app.");
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challengeData) {
      log.error("verifyEnrollment", `Challenge failed: ${challengeErr?.message}`, undefined, challengeErr);
      throw new Error("Failed to create challenge");
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: normalizedCode,
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

  async hasVerifiedTotp(): Promise<boolean> {
    const factors = await this.listFactors();
    return factors.some((f) => f.factor_type === "totp" && f.status === "verified");
  },


  /** Pre-create a challenge so the user's verify is a single round-trip. */
  async createChallenge(factorId: string): Promise<string> {
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error || !data) throw new Error("Failed to create MFA challenge");
    return data.id;
  },

  /** Verify a previously created challenge with the user's 6-digit code. */
  async verifyChallenge(factorId: string, challengeId: string, code: string): Promise<void> {
    const normalizedCode = code.replace(/\s/g, "");
    if (!isValidTotpCode(normalizedCode)) throw new Error("Enter the 6-digit code from your authenticator app.");
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: normalizedCode,
    });
    if (error) {
      log.warn("verifyChallenge", `Invalid code: ${error.message}`);
      throw new Error("Invalid verification code. Please try again.");
    }
    log.info("verifyChallenge", "2FA challenge passed — session elevated to AAL2");
    await this.markCurrentSessionVerified();
  },

  /** Submit a 6-digit code during login to elevate the session to AAL2. */
  async challengeAndVerify(factorId: string, code: string): Promise<void> {
    const challengeId = await this.createChallenge(factorId);
    await this.verifyChallenge(factorId, challengeId, code);
  },

  async markCurrentSessionVerified(): Promise<void> {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const sessionHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await (supabase as any).rpc("mark_two_factor_login_verified", { _session_hash: sessionHash });
      if (error) throw error;
    } catch (e) {
      log.warn(
        "markCurrentSessionVerified",
        `2FA session proof failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
};
