import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MemoryCache } from "@/lib/memory-cache";
import { queryKeys, CACHE_STATIC } from "@/lib/query-config";

export interface MilestoneRef {
  milestone_name: string;
  deliverables: string[];
  activities: string[];
  skills: string[];
}

const MEM_KEY = "milestone-reference";
const MEM_TTL = 60 * 60 * 1000; // 1 hour — milestones almost never change

/**
 * Fetches milestone reference data with double-layer cache:
 * 1. In-memory (0 latency, 1hr TTL) — prevents DB call entirely
 * 2. React Query (30min staleTime) — prevents re-render storms
 */
export function useMilestoneReference() {
  return useQuery({
    queryKey: queryKeys.milestoneReference(),
    queryFn: async () => {
      const cached = MemoryCache.get<MilestoneRef[]>(MEM_KEY);
      if (cached) return cached;

      const { data, error } = await supabase
        .from("milestone_reference")
        .select("milestone_name, deliverables, activities, skills")
        .order("milestone_name");
      if (error) throw error;
      const result = (data ?? []) as unknown as MilestoneRef[];
      MemoryCache.set(MEM_KEY, result, MEM_TTL);
      return result;
    },
    ...CACHE_STATIC,
  });
}

/**
 * Given selected milestones, compute unique deliverables/activities/skills.
 */
export function computeMilestoneData(
  selectedMilestones: string[],
  milestoneRefs: MilestoneRef[]
) {
  const deliverables = new Set<string>();
  const activities = new Set<string>();
  const skills = new Set<string>();

  for (const ms of selectedMilestones) {
    const ref = milestoneRefs.find((r) => r.milestone_name === ms);
    if (!ref) continue;
    ref.deliverables.forEach((d) => deliverables.add(d));
    ref.activities.forEach((a) => activities.add(a));
    ref.skills.forEach((s) => skills.add(s));
  }

  return {
    deliverables: [...deliverables].sort(),
    activities: [...activities].sort(),
    skills: [...skills].sort(),
  };
}
