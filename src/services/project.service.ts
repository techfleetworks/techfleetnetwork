// Client service for public.projects reads — the ONE owner of project reads for the UI
// (decisions.md §1). Pages/components call a use-project.ts hook that delegates here; none of them
// call supabase.from("projects") directly, so the column list lives in exactly one place and the
// surfaces that read a project can never drift apart again (ADR-0071).
//
// public.projects is COLUMN-SCOPED for `authenticated` (ADR-0056): a select('*') expands to the four
// operational columns this role cannot read and fails Postgres 42501 / HTTP 403 — the "Project not
// found" resume outage (ADR-0065). So every authenticated read here names explicit non-sensitive
// columns, never '*'. The four operational columns (discord_role_id, discord_role_name,
// notion_repository_url, client_intake_url) come only from get_project_internal_links (SECURITY
// DEFINER) or the service-role public-project-detail edge function — never a direct table read.
import { supabase } from "@/integrations/supabase/client";
import { retryPostgrest } from "@/lib/data/transient-retry";
import { NotFoundError } from "@/lib/errors/AppError";

/* ── Types (owned here; UI imports these, never the reverse) ─────────────────── */

/**
 * A project as the authenticated apply page reads it. `is_shipathon` is optional on purpose: a
 * missing column (projection/grant regression) stays visible to the compiler and resolves to the
 * normal question set rather than silently hiding questions (ADR-0055).
 */
export interface ProjectForApplication {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
  coordinator_id?: string | null;
  friendly_name?: string;
  description?: string;
  is_shipathon?: boolean;
}

/** The project shape the public-project-detail edge function returns (service-role projection). */
export interface PublicProjectDetail {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
  created_at: string;
  timezone_range?: string;
  anticipated_start_date?: string | null;
  anticipated_end_date?: string | null;
  client_intake_url?: string;
  notion_repository_url?: string;
  coordinator_id?: string | null;
  friendly_name?: string;
  description?: string;
  requires_interview?: boolean;
}

export interface PublicProjectDetailClient {
  id: string;
  name: string;
  website: string;
  mission: string;
  project_summary: string;
  primary_contact: string;
  status: string;
  logo_url?: string | null;
  kind?: "external" | "internal";
}

export interface PublicProjectMilestoneData {
  deliverables: string[];
  activities: string[];
  skills: string[];
}

/** The full payload of the public opening-detail page (project + embedded client + milestones). */
export interface PublicProjectDetailResponse {
  project: PublicProjectDetail;
  client: PublicProjectDetailClient | null;
  milestoneData: PublicProjectMilestoneData;
  applicationCount: number;
  coordinatorName: string | null;
}

/* ── Column contracts (single source of truth for what each surface selects) ─── */

/**
 * Columns the authenticated apply page renders. MUST include `is_shipathon` (granted to
 * `authenticated` by migration 20260921120000) so the Shipathon question flow stays correct
 * (ADR-0055), and MUST NOT include the four operational columns (column-scoped away for
 * `authenticated`, ADR-0056). Pinned by project.service.test.ts + the arch-gate no-`select('*')`
 * rule so it can neither regress to '*' nor silently drop is_shipathon.
 */
export const PROJECT_APPLICATION_COLUMNS =
  "id, client_id, project_type, phase, project_status, team_hats, current_phase_milestones, coordinator_id, friendly_name, description, is_shipathon";

/* ── Reads ───────────────────────────────────────────────────────────────────── */

/**
 * The apply page's project read — authenticated, RLS-scoped, explicit columns. A missing or
 * unreadable project surfaces as a thrown error (the page shows "Project not found") exactly as
 * before. Must be gated on a signed-in user by the caller so it runs as `authenticated`, not `anon`
 * (which holds no SELECT on projects).
 */
export async function getProjectForApplication(projectId: string): Promise<ProjectForApplication> {
  // retryPostgrest so a transient PGRST002 schema-cache reload (or 502/503) retries invisibly
  // instead of surfacing as "Project not found" — matches ProfileService. maybeSingle + an explicit
  // NotFoundError keeps the sanctioned no-".single()" shape while preserving throw-on-missing: the
  // apply page renders "Project not found" on a query error OR a missing row, exactly as before.
  // Non-transient errors (e.g. RLS/42501) still throw immediately (ADR-0065).
  const { data, error } = await retryPostgrest(() =>
    supabase.from("projects").select(PROJECT_APPLICATION_COLUMNS).eq("id", projectId).maybeSingle()
  );
  if (error) throw error;
  if (!data) throw new NotFoundError("Project");
  return data as unknown as ProjectForApplication;
}

/**
 * The PUBLIC opening-detail read for the anonymous route. That page serves logged-out visitors
 * (no ProtectedRoute; the public-project-detail edge function is verify_jwt=false), so it CANNOT use
 * the authenticated client — it goes through the service-role edge function, which owns the public
 * projection (no is_shipathon, operational links intentionally omitted). Deliberately kept on the
 * edge-fn transport (ADR-0071): routing it through the authenticated client would blank the page for
 * anon visitors, and switching to invokeEdge would first require the edge function's hand-rolled CORS
 * to add x-trace-id (decisions.md §5) plus a coordinated, non-atomic edge deploy.
 */
export async function getProjectDetailPublic(
  projectId: string
): Promise<PublicProjectDetailResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(
    `${supabaseUrl}/functions/v1/public-project-detail?projectId=${encodeURIComponent(projectId)}`,
    { headers: { apikey: anonKey, "Content-Type": "application/json" } }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Failed to load project");
  }
  return (await res.json()) as PublicProjectDetailResponse;
}
