// Read-only client for the Skills & Practices Framework relationship graph.
// Backed by `reference_relationships` (directed pairs across 13 entity types).
import { supabase } from "@/integrations/supabase/client";
import type { ReferenceEntity } from "./reference.service";

// The 13 framework entities. Each maps to a `reference_<entity>` table.
// "Roles" merged into "duties"; "team_functions" → "job_functions" (terminology rename 2026-05-03).
export type FrameworkEntity =
  | "skills"
  | "practices"
  | "activities"
  | "duties"
  | "deliverables"
  | "tools"
  | "project_milestones"
  | "projects"
  | "stakeholders"
  | "specializations"
  | "job_titles"
  | "resources"
  | "job_functions";

export const FRAMEWORK_ENTITIES: FrameworkEntity[] = [
  "skills",
  "practices",
  "activities",
  "duties",
  "deliverables",
  "tools",
  "project_milestones",
  "projects",
  "stakeholders",
  "specializations",
  "job_titles",
  "resources",
  "job_functions",
];

export const FRAMEWORK_LABELS: Record<FrameworkEntity, string> = {
  skills: "Technical and Interpersonal Skills",
  practices: "Team Practices",
  activities: "Activities",
  duties: "Duties",
  deliverables: "Deliverables",
  tools: "Tools",
  project_milestones: "Project Milestones",
  projects: "Projects",
  stakeholders: "Stakeholders",
  specializations: "Specializations",
  job_titles: "Job Titles",
  resources: "Resources",
  job_functions: "Job Functions",
};

export const FRAMEWORK_DEFINITIONS: Record<FrameworkEntity, string> = {
  skills: "A measured ability in an area of expertise (technical) or a measured ability to interact with others (interpersonal).",
  practices: "A belief and behavior that affects successful teamwork on empowered teams.",
  activities: "Something that teams do to complete work.",
  duties: "An expected responsibility associated with a job title.",
  deliverables: "Something provided as a result of a process.",
  tools: "An object (physical or digital) that's used to complete work.",
  project_milestones: "A measured outcome of work progress.",
  projects: "A work outcome that meets agreed-to goals.",
  stakeholders: "A person who drives the needs of work.",
  specializations: "An area of competency and expertise.",
  job_titles: "The label used to describe responsibilities at a company.",
  resources: "A person who contributes to the success of the work.",
  job_functions: "A grouping of related duties owned by a team or function.",
};

export const FRAMEWORK_GROUPS: Array<{ label: string; entities: FrameworkEntity[] }> = [
  {
    label: "Foundational",
    entities: ["skills", "practices", "activities", "duties", "deliverables"],
  },
  {
    label: "Project Context",
    entities: ["project_milestones", "projects", "tools", "stakeholders"],
  },
  {
    label: "Career Context",
    entities: ["specializations", "job_titles", "job_functions", "resources"],
  },
];

const _check: Record<FrameworkEntity, ReferenceEntity> = {
  skills: "skills",
  practices: "practices",
  activities: "activities",
  duties: "duties",
  deliverables: "deliverables",
  tools: "tools",
  project_milestones: "project_milestones",
  projects: "projects",
  stakeholders: "stakeholders",
  specializations: "job_specializations" as ReferenceEntity,
  job_titles: "job_titles",
  resources: "resources",
  job_functions: "job_functions",
};
// Map framework entity -> reference table name (handles specializations alias).
export const FRAMEWORK_TO_REFERENCE: Record<FrameworkEntity, ReferenceEntity> = _check;

export interface FrameworkRelationship {
  from_entity: FrameworkEntity;
  to_entity: FrameworkEntity;
  description: string;
  inverse_description: string | null;
  all_descriptions: string[];
}

export async function listRelationships(): Promise<FrameworkRelationship[]> {
  const { data, error } = await (supabase
    .from("reference_relationships" as any)
    .select("from_entity, to_entity, description, inverse_description, all_descriptions")
    .eq("is_active", true) as any);
  if (error) throw error;
  return (data ?? []) as FrameworkRelationship[];
}
