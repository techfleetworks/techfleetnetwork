// React Query hooks for Skills & Practices Framework relationships.
// Reference data changes very rarely → aggressive caching.
import { useQuery } from "@tanstack/react-query";
import { listRelationships, type FrameworkRelationship } from "@/services/framework.service";

const ONE_DAY = 1000 * 60 * 60 * 24;
const SEVEN_DAYS = ONE_DAY * 7;

export function useFrameworkRelationships() {
  return useQuery<FrameworkRelationship[]>({
    queryKey: ["framework-relationships"],
    queryFn: listRelationships,
    staleTime: ONE_DAY,
    gcTime: SEVEN_DAYS,
    retry: 1,
  });
}
