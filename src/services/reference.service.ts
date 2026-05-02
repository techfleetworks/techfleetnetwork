// Read-only client for reference_* lookup tables.
// All callers go through React Query hooks (use-reference.ts) for caching.
import { supabase } from "@/integrations/supabase/client";

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
  | "company_types";

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
