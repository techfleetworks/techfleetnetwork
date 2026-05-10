import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CommunityEvent } from "@/components/events/CommunityEventCard";
import { addWeeks } from "@/lib/events/weekRange";

async function fetchRange(from: Date, to: Date): Promise<CommunityEvent[]> {
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const { data, error } = await supabase.functions.invoke(`get-community-events?${qs.toString()}`, {
    method: "GET",
  });
  if (error) throw error;
  return ((data as { events?: CommunityEvent[] })?.events ?? []) as CommunityEvent[];
}

export function useCommunityEventsWeek(weekStart: Date) {
  const qc = useQueryClient();
  const weekEnd = addWeeks(weekStart, 1);
  const key = ["community-events", "week", weekStart.toISOString()];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchRange(weekStart, weekEnd),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Prefetch next week for snappy navigation.
  useEffect(() => {
    if (!query.data) return;
    const nextStart = addWeeks(weekStart, 1);
    const nextEnd = addWeeks(nextStart, 1);
    qc.prefetchQuery({
      queryKey: ["community-events", "week", nextStart.toISOString()],
      queryFn: () => fetchRange(nextStart, nextEnd),
      staleTime: 10 * 60 * 1000,
    });
  }, [query.data, weekStart, qc]);

  return query;
}
