import { supabase } from "@/integrations/supabase/client";
import { MemoryCache } from "@/lib/memory-cache";

export interface Workshop {
  id: string;
  name: string;
  category: string;
  description: string;
  figma_link: string;
  led_by: string;
  deliverables: string;
  accountable_function: string;
  functions_involved: string[];
  stakeholders: string[];
  timing: string;
  milestones: string;
  project_types: string[];
  skills: string[];
  company_types: string[];
}

export const workshopCategoryColors: Record<string, string> = {
  Operations: "bg-warning/10 text-warning border-warning/20",
  "Product Management": "bg-primary/10 text-primary border-primary/20",
  "User Experience": "bg-success/10 text-success border-success/20",
};

const CACHE_KEY = "workshops";
const CACHE_TTL = 30 * 60 * 1000; // 30 min

export async function fetchWorkshops(): Promise<Workshop[]> {
  const cached = MemoryCache.get<Workshop[]>(CACHE_KEY);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("workshops")
    .select("id, name, category, description, figma_link, led_by, deliverables, accountable_function, functions_involved, stakeholders, timing, milestones, project_types, skills, company_types")
    .order("name");

  if (error) throw error;
  const result = (data ?? []) as Workshop[];
  MemoryCache.set(CACHE_KEY, result, CACHE_TTL);
  return result;
}
