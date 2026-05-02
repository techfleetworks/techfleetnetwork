// React Query hooks for reference_* lookups.
// Reference data changes very rarely → aggressive caching.
import { useQuery } from "@tanstack/react-query";
import { listReference, type ReferenceEntity, type ReferenceItem } from "@/services/reference.service";

const ONE_DAY = 1000 * 60 * 60 * 24;
const SEVEN_DAYS = ONE_DAY * 7;

export function useReferenceList(entity: ReferenceEntity) {
  return useQuery({
    queryKey: ["reference", entity],
    queryFn: () => listReference(entity),
    staleTime: ONE_DAY,
    gcTime: SEVEN_DAYS,
    retry: 1,
  });
}

export function useReferenceOptions(entity: ReferenceEntity): { value: string; label: string }[] {
  const { data } = useReferenceList(entity);
  return (data ?? []).map((r: ReferenceItem) => ({ value: r.name, label: r.name }));
}
