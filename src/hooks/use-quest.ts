import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { QuestService, type QuestPath, type QuestPathStep, type UserQuestSelection } from "@/services/quest.service";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useQuestPaths() {
  return useQuery<QuestPath[]>({
    queryKey: ["quest-paths"],
    queryFn: QuestService.getPaths,
    staleTime: 5 * 60 * 1000,
  });
}

export function useQuestSteps(pathId: string | undefined) {
  return useQuery<QuestPathStep[]>({
    queryKey: ["quest-steps", pathId],
    queryFn: () => QuestService.getSteps(pathId!),
    enabled: !!pathId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllQuestSteps() {
  return useQuery<QuestPathStep[]>({
    queryKey: ["quest-steps-all"],
    queryFn: QuestService.getAllSteps,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserQuestSelections() {
  const { user } = useAuth();
  return useQuery<UserQuestSelection[]>({
    queryKey: ["quest-selections", user?.id],
    queryFn: () => QuestService.getUserSelections(user!.id),
    enabled: !!user?.id,
    staleTime: 0,
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
    staleTime: 0,
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
      qc.invalidateQueries({ queryKey: ["journey-completed"] });
      qc.invalidateQueries({ queryKey: ["journey-progress"] });
    },
    onError: () => toast.error("Failed to update step"),
  });
}
