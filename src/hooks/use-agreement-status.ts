import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AgreementStatus = "not_required" | "pending" | "signed";

export interface AgreementState {
  status: AgreementStatus;
  requiredAt: string | null;
  signedAt: string | null;
}

export function useAgreementStatus(applicationId: string | undefined | null, enabled = true) {
  return useQuery({
    queryKey: ["dashboard-agreement-status", applicationId],
    queryFn: async (): Promise<AgreementState> => {
      if (!applicationId) return { status: "not_required", requiredAt: null, signedAt: null };
      const { data, error } = await supabase
        .from("project_applications")
        .select("community_agreement_required_at, community_agreement_signed_at")
        .eq("id", applicationId)
        .maybeSingle();
      if (error) throw error;
      const requiredAt = (data as any)?.community_agreement_required_at as string | null ?? null;
      const signedAt = (data as any)?.community_agreement_signed_at as string | null ?? null;
      const status: AgreementStatus = !requiredAt ? "not_required" : signedAt ? "signed" : "pending";
      return { status, requiredAt, signedAt };
    },
    enabled: enabled && !!applicationId,
    staleTime: 30_000,
  });
}
