import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyCareerPlan,
  generateCareerPlan,
  updatePlanItemStatus,
  type GeneratePayload,
  type PlanItemStatus,
} from "@/services/career-plan.service";

const KEY = ["career-plan"] as const;

export function useCareerPlan() {
  return useQuery({
    queryKey: KEY,
    queryFn: getMyCareerPlan,
    staleTime: 1000 * 60 * 5,
  });
}

export function useGenerateCareerPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GeneratePayload) => generateCareerPlan(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePlanItemStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PlanItemStatus }) => updatePlanItemStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
