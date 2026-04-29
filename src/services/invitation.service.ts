import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("InvitationService");

export interface InvitationValidation {
  valid: boolean;
  email: string;
  reason?: "not_found" | "used" | "expired";
}

export const InvitationService = {
  async validate(token: string): Promise<InvitationValidation> {
    const tokenPreview = token.substring(0, 8) + "…";
    return log.track("validate", `Validating invitation token ${tokenPreview}`, { tokenPreview }, async () => {
      const { data, error } = await supabase.functions.invoke("public-auth-helpers", {
        body: { action: "validate_invitation", token },
      });

      const rows = (data?.data ?? []) as Array<{ email: string; expires_at: string; used_at: string | null }>;
      if (error || rows.length === 0) {
        log.warn("validate", `Invitation not found for token ${tokenPreview}`, {
          tokenPreview,
          hasError: !!error,
          errorMessage: error?.message,
          dataLength: rows.length,
        }, error);
        return { valid: false, email: "", reason: "not_found" as const };
      }

      const row = rows[0];
      if (row.used_at) {
        log.warn("validate", `Invitation already used for token ${tokenPreview}`, {
          tokenPreview,
          email: row.email,
          usedAt: row.used_at,
        });
        return { valid: false, email: row.email, reason: "used" as const };
      }
      if (new Date(row.expires_at) < new Date()) {
        log.warn("validate", `Invitation expired for token ${tokenPreview}`, {
          tokenPreview,
          email: row.email,
          expiresAt: row.expires_at,
        });
        return { valid: false, email: row.email, reason: "expired" as const };
      }

      log.info("validate", `Invitation valid for token ${tokenPreview}`, { tokenPreview, email: row.email });
      return { valid: true, email: row.email };
    });
  },

  async markUsed(token: string) {
    const tokenPreview = token.substring(0, 8) + "…";
    return log.track("markUsed", `Marking invitation ${tokenPreview} as used`, { tokenPreview }, async () => {
      const { data, error } = await supabase.functions.invoke("public-auth-helpers", {
        body: { action: "use_invitation", token },
      });
      if (error) {
        log.error("markUsed", `Database error marking invitation ${tokenPreview}: ${error.message}`, {
          tokenPreview,
          errorCode: error.code,
          errorDetails: error.details,
        }, error);
        throw new Error("Failed to mark invitation as used");
      }
      if (!data?.data) {
        log.warn("markUsed", `Invitation ${tokenPreview} could not be used — may have expired or been claimed`, { tokenPreview });
        throw new Error("Invitation could not be used — it may have expired or already been claimed.");
      }
      log.info("markUsed", `Invitation ${tokenPreview} marked as used`, { tokenPreview });
    });
  },
};
