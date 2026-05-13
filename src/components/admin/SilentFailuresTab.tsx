/**
 * SilentFailuresTab — surfaces the highest-volume `*_failed`,
 * `client_error*`, `edge_function_error`, `external_api_failed`,
 * `ui_*`, and authz_denied events from the audit log over a chosen
 * window. Backed by the `get_top_silent_failures(hours, limit)` RPC.
 *
 * Designed so admins can spot regressions ("Discord API failing 200×
 * in the last hour") without combing through the full activity log.
 */
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SilentFailureRow {
  event_type: string;
  table_name: string;
  occurrences: number;
  last_seen: string;
  sample_error: string | null;
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function SilentFailuresTab() {
  const [hours, setHours] = useState("24");

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["system-health", "silent-failures", hours],
    queryFn: async () => {
      // RPC name is allow-listed below — typed any cast keeps the call tree
      // generic without bloating Supabase types.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: SilentFailureRow[] | null; error: unknown }>)("get_top_silent_failures", {
        p_hours: Number(hours),
        p_limit: 25,
      });
      if (error) {
        // PostgREST/Supabase errors are plain objects, not Error instances —
        // String(obj) yields "[object Object]". Surface message/code/details instead.
        if (error instanceof Error) throw error;
        const e = error as { message?: string; code?: string; details?: string; hint?: string };
        const parts = [e.message, e.code ? `(${e.code})` : null, e.details, e.hint]
          .filter(Boolean)
          .join(" ");
        throw new Error(parts || JSON.stringify(error));
      }
      return (data ?? []) as SilentFailureRow[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const generatedAt = useMemo(
    () => new Date(dataUpdatedAt || Date.now()).toISOString(),
    [dataUpdatedAt],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
              Silent failures
            </CardTitle>
            <CardDescription className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" aria-hidden /> Updated {relativeTime(generatedAt)} · Grouped from the audit log.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Silent failures time range">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last hour</SelectItem>
                <SelectItem value="24">Last 24 hours</SelectItem>
                <SelectItem value="168">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh silent failures">
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive" role="alert">
            {error instanceof Error ? error.message : "Could not load silent failures."}
          </p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No silent failures in this window. 🎉</p>
        ) : (
          data.map((row) => (
            <div key={`${row.event_type}-${row.table_name}-${row.last_seen}`} className="rounded-lg border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="destructive">{row.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">{row.table_name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {row.occurrences} occurrences · {relativeTime(row.last_seen)}
                </span>
              </div>
              {row.sample_error && (
                <p className="mt-2 text-sm text-foreground break-words">{row.sample_error}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
