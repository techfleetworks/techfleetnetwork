import { useQuery } from "@/lib/react-query";
import { JourneyService } from "@/services/journey.service";
import type { Database } from "@/integrations/supabase/types";

type JourneyPhase = Database["public"]["Enums"]["journey_phase"];

export function useCompletedCount(
  userId: string | undefined,
  phase: JourneyPhase,
  validTaskIds?: readonly string[]
) {
  return useQuery({
    queryKey: ["journey-completed", userId, phase, validTaskIds ? [...validTaskIds].sort().join(",") : "__all__"],
    queryFn: () => JourneyService.getCompletedCount(userId!, phase, validTaskIds),
    enabled: !!userId,
    staleTime: 0, // Always refetch on mount so completed courses reflect immediately
  });
}

export function useJourneyProgress(userId: string | undefined, phase: JourneyPhase) {
  return useQuery({
    queryKey: ["journey-progress", userId, phase],
    queryFn: () => JourneyService.getProgress(userId!, phase),
    enabled: !!userId,
    staleTime: 0, // Always refetch on mount so completed courses reflect immediately
  });
}
