import { useMutation } from "@/lib/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";

/**
 * Marks the mandatory Welcome Flow complete for the current user (step g). Wraps the
 * single owner (ProfileService.markWelcomeFlowComplete → set-once mark_welcome_flow_complete
 * RPC); the write is bounded and idempotent, so firing it on reaching step (g) — and again
 * on a replay — is safe. On success it refreshes the shared profile so the completion fact
 * (welcome_flow_completed_at) is visible to the rest of the app and, once it ships, the
 * route gate (PR5). The caller must confirm success before navigating away (FR-g3).
 */
export function useCompleteWelcomeFlow() {
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      await ProfileService.markWelcomeFlowComplete(user.id);
    },
    onSuccess: () => {
      void refreshProfile();
    },
  });
}
