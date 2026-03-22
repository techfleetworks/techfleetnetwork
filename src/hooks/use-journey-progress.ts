import { useQuery } from "@/lib/react-query";
import { JourneyService } from "@/services/journey.service";
import type { Database } from "@/integrations/supabase/types";

type JourneyPhase = Database["public"]["Enums"]["journey_phase"];

export function useCompletedCount(userId: string | undefined, phase: JourneyPhase) {
  return useQuery({
    queryKey: ["journey-completed", userId, phase],
    queryFn: () => JourneyService.getCompletedCount(userId!, phase),
    enabled: !!userId,
  });
}

export function useJourneyProgress(userId: string | undefined, phase: JourneyPhase) {
  return useQuery({
    queryKey: ["journey-progress", userId, phase],
    queryFn: () => JourneyService.getProgress(userId!, phase),
    enabled: !!userId,
  });
}

/**
 * Returns the total number of first-steps tasks (fixed at 6).
 */
export function useFirstStepsTotalForUser(
  _profile?: { discord_username?: string | null } | null
): number {
  return 6;
}
