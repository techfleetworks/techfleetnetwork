import { useMutation, useQuery, useQueryClient } from "@/lib/react-query";
import { CohortService } from "@/services/cohort.service";
import type { CohortRegistrationStatus } from "@/lib/validators/cohort";
import { CACHE_USER_MUTABLE } from "@/lib/query-config";
import { useAuth } from "@/contexts/AuthContext";

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

/**
 * All cohorts the current user may manage (their own if a teacher, every one if an admin), each with
 * its parent class — powers the standalone Cohorts tab in Class Admin. Row scoping is enforced by RLS,
 * so the key only needs the identity; switching users can't reuse another user's scoped rows.
 */
export function useCohortsForScope() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cohorts", "scope", user?.id ?? "anon"] as const,
    queryFn: () => CohortService.listForScope(),
    enabled: !!user,
    ...CACHE_USER_MUTABLE,
  });
}

/**
 * Delete a cohort via the owner-or-admin RPC (ADR-0063), then refresh the scoped list, the parent
 * class's cohort list, and the cohort-by-id cache. The RPC decides hard-delete vs soft-cancel; the
 * resolved value ("deleted" | "cancelled") is returned so the caller can tailor the confirmation toast.
 */
export function useDeleteCohort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["cohorts", "delete"] as const,
    mutationFn: (vars: { cohortId: string; classId?: string }) =>
      CohortService.remove(vars.cohortId),
    onSuccess: (_res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["cohorts", "scope"] });
      void queryClient.invalidateQueries({ queryKey: ["cohorts", "byId", vars.cohortId] });
      if (vars.classId) {
        void queryClient.invalidateQueries({ queryKey: ["cohorts", "class", vars.classId] });
      }
    },
  });
}
