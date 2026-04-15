import { supabase } from "@/integrations/supabase/client";
import { MemoryCache } from "@/lib/memory-cache";

export interface Handbook {
  id: string;
  name: string;
  description: string;
  target_audience: string;
  category: string;
  contents: string[];
  link: string;
}

export const handbookCategoryColors: Record<string, string> = {
  Agile: "bg-primary/10 text-primary border-primary/20",
  Operations: "bg-warning/10 text-warning border-warning/20",
  Training: "bg-success/10 text-success border-success/20",
};

const CACHE_KEY = "handbooks";
const CACHE_TTL = 30 * 60 * 1000; // 30 min — handbooks change very rarely

export async function fetchHandbooks(): Promise<Handbook[]> {
  const cached = MemoryCache.get<Handbook[]>(CACHE_KEY);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("handbooks")
    .select("id, name, description, target_audience, category, contents, link")
    .order("name");

  if (error) throw error;
  const result = (data ?? []) as Handbook[];
  MemoryCache.set(CACHE_KEY, result, CACHE_TTL);
  return result;
}
