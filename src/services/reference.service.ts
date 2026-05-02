// Read-only client for reference_* lookup tables.
// All callers go through React Query hooks (use-reference.ts) for caching.
import { supabase } from "@/integrations/supabase/client";

// Union of every reference_* table the app queries.
export type ReferenceEntity =
  | "skills"
  | "practices"
  | "activities"
  | "duties"
  | "deliverables"
  | "workshops"
  | "agile_methods"
  | "project_milestones"
  | "team_functions"
  | "tools"
  | "tech_job_categories"
  | "job_industries"
  | "job_specializations"
  | "company_types"
  // Added with the Skills & Practices Framework feature.
  | "projects"
  | "stakeholders"
  | "job_titles"
  | "resources"
  | "roles";

export interface ReferenceItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
}

const tableFor = (entity: ReferenceEntity) => `reference_${entity}` as const;

export async function listReference(entity: ReferenceEntity): Promise<ReferenceItem[]> {
  // `as any` to avoid generated-types narrowing on the dynamic table name; columns are explicit.
  const { data, error } = await (supabase
    .from(tableFor(entity) as any)
    .select("id, slug, name, description, category")
    .eq("is_active", true)
    .order("name") as any);
  if (error) throw error;
  return (data ?? []) as ReferenceItem[];
}

/**
 * Batch-fetch many reference entity types in a single round-trip.
 * Backed by the `framework_entity_v` view (UNION ALL across reference_* tables).
 * Returns a map keyed by entity type for O(1) consumer access.
 */
export async function listReferenceBatch(
  entities: ReferenceEntity[]
): Promise<Record<string, ReferenceItem[]>> {
  if (entities.length === 0) return {};
  const { data, error } = await (supabase
    .from("framework_entity_v" as any)
    .select("entity_type, id, slug, name, description, category")
    .in("entity_type", entities as string[])
    .eq("is_active", true)
    .order("name") as any);
  if (error) throw error;
  const out: Record<string, ReferenceItem[]> = Object.fromEntries(entities.map((e) => [e, []]));
  for (const row of (data ?? []) as Array<ReferenceItem & { entity_type: string }>) {
    const { entity_type, ...item } = row;
    (out[entity_type] ||= []).push(item);
  }
  return out;
}

export async function searchReference(
  entity: ReferenceEntity,
  query: string,
  limit = 25
): Promise<ReferenceItem[]> {
  const q = query.trim();
  if (!q) return listReference(entity).then((r) => r.slice(0, limit));
  const { data, error } = await (supabase
    .from(tableFor(entity) as any)
    .select("id, slug, name, description, category")
    .eq("is_active", true)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(limit) as any);
  if (error) throw error;
  return (data ?? []) as ReferenceItem[];
}
