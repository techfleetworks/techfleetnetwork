import { useQuery } from "@/lib/react-query";
import { ProfileService } from "@/services/profile.service";

/**
 * Live count of members who have completed the mandatory Welcome Flow. Reads through
 * the single owner (ProfileService → get_welcome_flow_completion_count RPC), which
 * counts source-of-truth rows at read time — there is no stored counter to drift
 * (ADR-0050). Drives the Courses completion stat (requirements §4.11 / §6.13).
 *
 * Cached for 5 minutes — a vanity stat, no need for tight freshness (mirrors
 * useCourseCompletionCounts).
 */
export function useWelcomeFlowCompletionCount() {
  return useQuery({
    queryKey: ["welcome-flow-completion-count"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: () => ProfileService.getWelcomeFlowCompletionCount(),
  });
}
