import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";

/**
 * Returns a stable saver that writes profile fields through the single owner
 * (ProfileService.updateFields — allow-listed + sanitized) and refreshes the shared
 * profile so the edit is visible app-wide (bidirectional, FR-f3). Components go through
 * this hook rather than calling the service directly (src/components/CLAUDE.md). The
 * saver throws on failure so an autosave caller can drive its own backoff/retry UI.
 */
export function useUpdateProfileFields() {
  const { user, refreshProfile } = useAuth();
  return useCallback(
    async (fields: Record<string, unknown>) => {
      if (!user) throw new Error("Not authenticated");
      await ProfileService.updateFields(user.id, fields);
      await refreshProfile();
    },
    [user, refreshProfile],
  );
}
