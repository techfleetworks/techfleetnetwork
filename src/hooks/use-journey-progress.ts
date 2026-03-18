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
 * Returns the correct total number of first-steps tasks for this user.
 * Users who already have a Discord username skip "join-discord" (5 tasks),
 * otherwise they have 6 tasks.
 */
export function useFirstStepsTotalForUser(
  profile: { discord_username?: string | null } | null | undefined
): number {
  const hasDiscord = profile?.discord_username && profile.discord_username.trim() !== "";
  return hasDiscord ? 5 : 6;
}
