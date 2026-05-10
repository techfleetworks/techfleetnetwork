import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";

interface HealthRow {
  last_refresh_status: string | null;
  last_refresh_error: string | null;
  fetched_at: string | null;
  event_count: number | null;
  updated_at: string | null;
}

const STALE_MS = 30 * 60 * 1000; // 30 minutes

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

/**
 * Admin-only banner that exposes calendar-sync failures on the Events page.
 * Renders nothing for regular users (graceful degradation) and nothing for
 * admins when sync is healthy.
 */
export function EventsSyncHealthBanner() {
  const { isAdmin } = useAdmin();

  const { data } = useQuery<HealthRow | null>({
    queryKey: ["community-events-health"],
    enabled: isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_community_events_health");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as HealthRow) ?? null;
    },
  });

  if (!isAdmin || !data) return null;

  const status = data.last_refresh_status;
  const fetchedAt = data.fetched_at;
  const stale = !fetchedAt || Date.now() - new Date(fetchedAt).getTime() > STALE_MS;
  const failing = status === "error" || status === "config_error" || status === "kick_error";

  if (!failing && !stale) return null;

  return (
    <div
      role="alert"
      className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            Calendar sync {failing ? "is failing" : "is stale"} — admins only
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last attempt: {formatRelative(data.updated_at)}
            {fetchedAt ? ` · last successful sync: ${formatRelative(fetchedAt)}` : " · never synced"}
            {typeof data.event_count === "number" ? ` · ${data.event_count} cached` : ""}
            {data.last_refresh_error ? ` · ${data.last_refresh_error}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
