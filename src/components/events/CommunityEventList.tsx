import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CommunityEventCard, type CommunityEvent } from "./CommunityEventCard";

interface Props {
  timeZone: string;
  fallbackUrl: string;
}

async function fetchEvents(): Promise<CommunityEvent[]> {
  const { data, error } = await supabase.functions.invoke("get-community-events", {
    method: "GET",
  });
  if (error) throw error;
  return ((data as { events?: CommunityEvent[] })?.events ?? []) as CommunityEvent[];
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-5">
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse mb-2" />
          <div className="h-3 w-1/3 bg-muted rounded animate-pulse mb-4" />
          <div className="h-3 w-full bg-muted rounded animate-pulse mb-1" />
          <div className="h-3 w-5/6 bg-muted rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function CommunityEventList({ timeZone, fallbackUrl }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["community-events"],
    queryFn: fetchEvents,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (isLoading) {
    return (
      <section aria-label="Loading upcoming events" className="mt-2">
        <Skeleton />
      </section>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">Couldn't load events</p>
            <p className="text-muted-foreground mt-0.5">
              We couldn't reach the Tech Fleet calendar right now.{" "}
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open the calendar on Google →
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <CalendarOff className="mx-auto h-8 w-8 text-muted-foreground mb-2" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">No upcoming events</p>
        <p className="text-xs text-muted-foreground mt-1">
          Check back soon — new community events are added regularly.
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Browse the full calendar on Google →
          </a>
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Upcoming Tech Fleet community events" className="space-y-3">
      {data.map((ev) => (
        <CommunityEventCard key={ev.uid} event={ev} timeZone={timeZone} />
      ))}
    </section>
  );
}
