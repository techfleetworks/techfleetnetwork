// React Query hooks for public.projects reads. UI calls these; they delegate to project.service.ts
// (the one owner of projects reads — decisions.md §1). Query keys are preserved verbatim from the
// inline reads these replace, so cache identity and existing cross-surface invalidations keep
// working — e.g. the apply page invalidates ["public-project-detail", projectId] after submit so the
// public opening page's application count and applied-state refresh.
import { useQuery } from "@/lib/react-query";
import { getProjectDetailPublic, getProjectForApplication } from "@/services/project.service";

const keys = {
  forApplication: (projectId: string | undefined) => ["project-detail", projectId] as const,
  publicDetail: (projectId: string | undefined) => ["public-project-detail", projectId] as const,
};

/**
 * The apply page's project read. Gate on a signed-in user (pass `enabled: !!user`) so it runs as
 * `authenticated` — `anon` holds no SELECT on projects — matching the pre-refactor guard exactly.
 */
export function useProjectForApplication(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: keys.forApplication(projectId),
    queryFn: () => getProjectForApplication(projectId!),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
}

/** The public/anon opening-detail read (service-role edge function; safe for logged-out visitors). */
export function usePublicProjectDetail(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.publicDetail(projectId),
    queryFn: () => getProjectDetailPublic(projectId!),
    enabled: !!projectId,
  });
}
