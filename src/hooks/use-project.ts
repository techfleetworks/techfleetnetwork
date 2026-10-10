// React Query hooks for public.projects reads. UI calls these; they delegate to project.service.ts
// (the one owner of projects reads — decisions.md §1). Query keys are preserved verbatim from the
// inline reads these replace, so cache identity and existing cross-surface invalidations keep
// working — e.g. the apply page invalidates ["public-project-detail", projectId] after submit so the
// public opening page's application count and applied-state refresh.
import { useQuery } from "@/lib/react-query";
import {
  getProjectDetailPublic,
  getProjectForApplication,
  getProjectForApplicationStatus,
  getProjectForRoster,
  getProjectForSubmissionDetail,
  getProjectInternalLinks,
  getProjectsForMyApplications,
  listHandoffProjects,
  listRecruitingProjects,
} from "@/services/project.service";

const keys = {
  forApplication: (projectId: string | undefined) => ["project-detail", projectId] as const,
  publicDetail: (projectId: string | undefined) => ["public-project-detail", projectId] as const,
  myApplications: (projectIds: string[]) => ["my-projects-for-apps", projectIds] as const,
  forApplicationStatus: (projectId: string | undefined) =>
    ["project-for-app-status", projectId] as const,
  forSubmissionDetail: (projectId: string | undefined) =>
    ["admin-proj-detail-for-app", projectId] as const,
  recruiting: () => ["recruiting-all-projects"] as const,
  handoff: () => ["admin-handoff-projects"] as const,
  forRoster: (projectId: string | undefined) => ["roster-proj-detail", projectId] as const,
  rosterLinks: (projectId: string | undefined) => ["roster-proj-links", projectId] as const,
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

/** Member "My Applications": the applied projects by id set. */
export function useProjectsForMyApplications(projectIds: string[]) {
  return useQuery({
    queryKey: keys.myApplications(projectIds),
    queryFn: () => getProjectsForMyApplications(projectIds),
    enabled: projectIds.length > 0,
  });
}

/** The member's application-status page: the one project the application targets. */
export function useProjectForApplicationStatus(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: keys.forApplicationStatus(projectId),
    queryFn: () => getProjectForApplicationStatus(projectId!),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
}

/** Admin viewing one submitted application: the project it targets. */
export function useProjectForSubmissionDetail(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: keys.forSubmissionDetail(projectId),
    queryFn: () => getProjectForSubmissionDetail(projectId!),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
}

/** Admin recruiting roster: all projects (+ embedded client name). Gate on a signed-in user. */
export function useRecruitingProjects(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: keys.recruiting(),
    queryFn: () => listRecruitingProjects(),
    enabled: options?.enabled ?? true,
  });
}

/** Admin hand-off project picker: all projects (+ embedded client name). */
export function useHandoffProjects(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: keys.handoff(),
    queryFn: () => listHandoffProjects(),
    enabled: options?.enabled ?? true,
  });
}

/** Admin roster applicant detail: the one project (+ embedded client name) applied to. */
export function useProjectForRoster(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: keys.forRoster(projectId),
    queryFn: () => getProjectForRoster(projectId!),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
}

/**
 * Admin-only operational links (discord role / notion / intake URL) for the roster applicant detail
 * page, via the get_project_internal_links RPC. Key preserved from the inline query it replaces.
 */
export function useRosterProjectLinks(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: keys.rosterLinks(projectId),
    queryFn: () => getProjectInternalLinks(projectId!),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
}
