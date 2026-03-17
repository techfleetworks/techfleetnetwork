import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MilestoneRef {
  milestone_name: string;
  deliverables: string[];
  activities: string[];
  skills: string[];
}

/**
 * Fetches milestone reference data (deliverables, activities, skills per milestone).
 * Cached for 30 min since this rarely changes.
 */
export function useMilestoneReference() {
  return useQuery({
    queryKey: ["milestone-reference"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestone_reference")
        .select("milestone_name, deliverables, activities, skills")
        .order("milestone_name");
      if (error) throw error;
      return (data ?? []) as unknown as MilestoneRef[];
    },
    staleTime: 30 * 60 * 1000,
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
