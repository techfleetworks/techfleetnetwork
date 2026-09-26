import { useMutation, useQuery, useQueryClient } from "@/lib/react-query";
import { CohortService } from "@/services/cohort.service";
import type { CohortRegistrationStatus } from "@/lib/validators/cohort";
import { CACHE_USER_MUTABLE } from "@/lib/query-config";

export function useCohortsByClass(
  classId: string | undefined,
  opts: { publishedOnly?: boolean } = {}
) {
  return useQuery({
    queryKey: [
      "cohorts",
      "class",
      classId ?? "none",
      opts.publishedOnly ? "published" : "all",
    ] as const,
    queryFn: () => {
      if (!classId) return Promise.resolve([]);
      return opts.publishedOnly
        ? CohortService.listPublishedByClass(classId)
        : CohortService.listByClass(classId);
    },
    enabled: !!classId,
    ...CACHE_USER_MUTABLE,
  });
}

export function useCohortById(cohortId: string | undefined) {
  return useQuery({
    queryKey: ["cohorts", "byId", cohortId ?? "none"] as const,
    queryFn: () => (cohortId ? CohortService.getById(cohortId) : Promise.resolve(null)),
    enabled: !!cohortId,
    ...CACHE_USER_MUTABLE,
  });
}

/**
 * Set a cohort's registration status (Coming Soon / Register Now / Live / Finished) via the
 * owner-or-admin RPC, then refresh the cohort lists/detail so the badge and dropdown reflect the
 * new value. `classId` scopes the list invalidation (matches useCohortsByClass's
 * ["cohorts","class",id] key, both published-only and all variants).
 */
export function useSetCohortRegistrationStatus(classId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["cohorts", "setRegistrationStatus"] as const,
    mutationFn: (vars: { cohortId: string; status: CohortRegistrationStatus }) =>
      CohortService.setRegistrationStatus(vars.cohortId, vars.status),
    onSuccess: (_res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["cohorts", "class", classId ?? "none"] });
      void queryClient.invalidateQueries({ queryKey: ["cohorts", "byId", vars.cohortId] });
    },
  });
}
