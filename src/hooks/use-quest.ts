import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { QuestService, type QuestPath, type QuestPathStep, type UserQuestSelection, type SystemVerificationData } from "@/services/quest.service";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useAdaptiveInterval } from "@/hooks/use-adaptive-interval";

/** Static reference data — 10 min stale, shared across all users */
const STATIC_STALE_TIME = 10 * 60 * 1000;
/** User-specific data — 2 min stale, refetch on focus */
const USER_STALE_TIME = 2 * 60 * 1000;

export function useQuestPaths() {
  return useQuery<QuestPath[]>({
    queryKey: ["quest-paths"],
    queryFn: QuestService.getPaths,
    staleTime: STATIC_STALE_TIME,
    gcTime: 30 * 60 * 1000, // Keep in cache 30 min
  });
}

export function useQuestSteps(pathId: string | undefined) {
  return useQuery<QuestPathStep[]>({
    queryKey: ["quest-steps", pathId],
    queryFn: () => QuestService.getSteps(pathId!),
    enabled: !!pathId,
    staleTime: STATIC_STALE_TIME,
    gcTime: 30 * 60 * 1000,
  });
}

export function useAllQuestSteps() {
  return useQuery<QuestPathStep[]>({
    queryKey: ["quest-steps-all"],
    queryFn: QuestService.getAllSteps,
    staleTime: STATIC_STALE_TIME,
    gcTime: 30 * 60 * 1000,
  });
}

export function useUserQuestSelections() {
  const { user } = useAuth();
  return useQuery<UserQuestSelection[]>({
    queryKey: ["quest-selections", user?.id],
    queryFn: () => QuestService.getUserSelections(user!.id),
    enabled: !!user?.id,
    staleTime: USER_STALE_TIME,
  });
}

export function useAddQuestPath() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pathId: string) => QuestService.addPath(user!.id, pathId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quest-selections"] });
      toast.success("Path added to your journey");
    },
    onError: () => toast.error("Failed to add path"),
  });
}

/** Batch-add multiple paths in one round-trip */
export function useBatchAddQuestPaths() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pathIds: string[]) => QuestService.addPaths(user!.id, pathIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quest-selections"] });
    },
    onError: () => toast.error("Failed to add paths"),
  });
}

export function useRemoveQuestPath() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pathId: string) => QuestService.removePath(user!.id, pathId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quest-selections"] });
      toast.success("Path removed from your journey");
    },
    onError: () => toast.error("Failed to remove path"),
  });
}

export function useSelfReportProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["quest-self-report", user?.id],
    queryFn: () => QuestService.getSelfReportProgress(user!.id),
    enabled: !!user?.id,
    staleTime: USER_STALE_TIME,
  });
}

export function useCompleteSelfReportStep() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, completed }: { stepId: string; completed: boolean }) =>
      QuestService.completeSelfReportStep(user!.id, stepId, completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quest-self-report"] });
      qc.invalidateQueries({ queryKey: ["quest-all-journey-progress"] });
      qc.invalidateQueries({ queryKey: ["journey-completed"] });
      qc.invalidateQueries({ queryKey: ["journey-progress"] });
    },
    onError: () => toast.error("Failed to update step"),
  });
}

/**
 * Single query that fetches ALL journey progress across ALL phases.
 * Replaces 7 individual useJourneyProgress() calls in QuestRoadmap,
 * reducing server hits from 7 queries → 1 query per page load.
 * Uses adaptive polling interval to further reduce load when tab is hidden.
 */
export function useAllJourneyProgress() {
  const { user } = useAuth();
  const refetchInterval = useAdaptiveInterval(5 * 60 * 1000); // 5 min base, 20 min hidden
  return useQuery({
    queryKey: ["quest-all-journey-progress", user?.id],
    queryFn: () => QuestService.getAllJourneyProgress(user!.id),
    enabled: !!user?.id,
    staleTime: USER_STALE_TIME,
    refetchInterval,
  });
}
