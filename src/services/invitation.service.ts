import { supabase } from "@/integrations/supabase/client";

export interface InvitationValidation {
  valid: boolean;
  email: string;
  reason?: "not_found" | "used" | "expired";
}

export const InvitationService = {
  async validate(token: string): Promise<InvitationValidation> {
    // Use secure RPC function instead of direct table access
    const { data, error } = await supabase.rpc("validate_invitation", {
      p_token: token,
    });

    if (error || !data || data.length === 0) {
      return { valid: false, email: "", reason: "not_found" };
    }

    const row = data[0];
    if (row.used_at) return { valid: false, email: row.email, reason: "used" };
    if (new Date(row.expires_at) < new Date()) {
      return { valid: false, email: row.email, reason: "expired" };
    }

    return { valid: true, email: row.email };
  },

  async markUsed(token: string) {
    // Use secure RPC function instead of direct table update
    const { data, error } = await supabase.rpc("use_invitation", {
      p_token: token,
    });
    if (error) throw new Error("Failed to mark invitation as used");
    if (!data) throw new Error("Invitation could not be used — it may have expired or already been claimed.");
  },
};
