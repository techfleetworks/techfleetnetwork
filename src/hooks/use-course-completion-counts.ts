import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type JourneyPhase = Database["public"]["Enums"]["journey_phase"];

export interface CourseCompletionSpec {
  /** Stable course identifier matching CourseCard.id */
  key: string;
  phase: JourneyPhase;
  /** All required task IDs the user must complete to count as a course completer */
  task_ids: readonly string[];
}

/**
 * Aggregate count of *other* members who have completed each course.
 * Powered by SECURITY DEFINER RPC `get_course_completion_counts` — returns
 * counts only, never per-user rows. Caller (auth.uid()) is excluded server-side.
 *
 * Cached for 5 minutes — vanity stat, no need for tight freshness.
 */
export function useCourseCompletionCounts(specs: CourseCompletionSpec[]) {
  // Stable cache key independent of array order
  const stableKey = [...specs]
    .map((s) => `${s.key}:${s.phase}:${s.task_ids.length}`)
    .sort()
    .join("|");

  return useQuery({
    queryKey: ["course-completion-counts", stableKey],
    enabled: specs.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const payload = specs.map((s) => ({
        key: s.key,
        phase: s.phase,
        task_ids: [...s.task_ids],
      }));
      const { data, error } = await supabase.rpc(
        "get_course_completion_counts",
        // typed as Json by generated types
        { _course_specs: payload as unknown as never },
      );
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((row: { course_key: string; completers: number | string }) => {
        map[row.course_key] = Number(row.completers) || 0;
      });
      return map;
    },
  });
}
