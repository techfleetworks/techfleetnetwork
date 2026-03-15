import { supabase } from "@/integrations/supabase/client";

export interface InvitationValidation {
  valid: boolean;
  email: string;
  reason?: "not_found" | "used" | "expired";
}

export const InvitationService = {
  async validate(token: string): Promise<InvitationValidation> {
    const { data } = await supabase
      .from("invitations")
      .select("email, expires_at, used_at")
      .eq("token", token)
      .single();

    if (!data) return { valid: false, email: "", reason: "not_found" };
    if (data.used_at) return { valid: false, email: data.email, reason: "used" };
    if (new Date(data.expires_at) < new Date()) return { valid: false, email: data.email, reason: "expired" };

    return { valid: true, email: data.email };
  },

  async markUsed(token: string) {
    const { error } = await supabase
      .from("invitations")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);
    if (error) throw new Error("Failed to mark invitation as used");
  },
};
