/**
 * PerformanceTab — Real User Monitoring (RUM) view in the System Health page.
 *
 * Shows per-route p75/p95 of Core Web Vitals (LCP, INP, CLS, FCP, TTFB) over a
 * configurable rolling window (default 24h). Powered by the
 * `web_vitals_p75` RPC on top of `web_vital_samples` written by the
 * `record-web-vital` edge function.
 *
 * Why this matters: pre-RUM we only had aggregate analytics (bounce, session
 * duration). With RUM, admins can see — for example — that p75 LCP on
 * `/login` for users on 3g is 4.2s and prioritise accordingly. This is the
 * missing piece called out in the "Recommended next round" perf report.
 *
 * Read-only: no actions, no writes. RLS already restricts the underlying
 * table to admins.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, RefreshCw } from "lucide-react";
import { PerformanceByBrowserTab } from "./PerformanceByBrowserTab";

type MetricName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";

interface VitalRow {
  route: string;
  metric_name: MetricName;
  sample_count: number;
  p75: number;
  p95: number;
  good_pct: number;
}

// Google's "good" thresholds — kept in sync with the rating field set by
// web-vitals on the client. Used here only for deciding the badge variant
// of the P75 column when the API doesn't carry per-row rating.
const GOOD_THRESHOLDS: Record<MetricName, number> = {
  LCP: 2500,   // ms
  INP: 200,    // ms
  CLS: 0.1,    // unitless
  FCP: 1800,   // ms
  TTFB: 800,   // ms
};
const POOR_THRESHOLDS: Record<MetricName, number> = {
  LCP: 4000,
  INP: 500,
  CLS: 0.25,
  FCP: 3000,
  TTFB: 1800,
};

function formatValue(metric: MetricName, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (metric === "CLS") return v.toFixed(3);
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(2)} s`;
}

function ratingFor(metric: MetricName, v: number): "good" | "needs-improvement" | "poor" {
  if (v <= GOOD_THRESHOLDS[metric]) return "good";
  if (v <= POOR_THRESHOLDS[metric]) return "needs-improvement";
  return "poor";
}

function ratingBadge(rating: "good" | "needs-improvement" | "poor") {
  const map = {
    "good": { label: "Good", variant: "default" as const, className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400" },
    "needs-improvement": { label: "Needs work", variant: "secondary" as const, className: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400" },
    "poor": { label: "Poor", variant: "destructive" as const, className: "" },
  } as const;
  const cfg = map[rating];
  return (
    <Badge variant={cfg.variant} className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

const WINDOW_OPTIONS = [
  { value: "1", label: "Last hour" },
  { value: "6", label: "Last 6 hours" },
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
] as const;

export function PerformanceTab() {
  return (
    <Tabs defaultValue="route" className="space-y-4">
      <TabsList>
        <TabsTrigger value="route">By route</TabsTrigger>
        <TabsTrigger value="browser">By browser</TabsTrigger>
      </TabsList>
      <TabsContent value="route" className="mt-0">
        <PerformanceByRouteTab />
      </TabsContent>
      <TabsContent value="browser" className="mt-0">
        <PerformanceByBrowserTab />
      </TabsContent>
    </Tabs>
  );
}

function PerformanceByRouteTab() {
  const [windowHours, setWindowHours] = useState("24");
  const numericWindow = useMemo(() => Number.parseInt(windowHours, 10) || 24, [windowHours]);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["web-vitals-p75", numericWindow],
    queryFn: async (): Promise<VitalRow[]> => {
      const { data, error } = await supabase.rpc("web_vitals_p75", {
        window_hours: numericWindow,
      });
      if (error) throw error;
      return (data ?? []) as VitalRow[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Group rows by route for a scannable two-level view.
  const grouped = useMemo(() => {
    const m = new Map<string, VitalRow[]>();
    for (const row of data ?? []) {
      const list = m.get(row.route) ?? [];
      list.push(row);
      m.set(row.route, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const totalSamples = useMemo(
    () => (data ?? []).reduce((sum, r) => sum + (r.sample_count ?? 0), 0),
    [data],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">Real User Monitoring (Core Web Vitals)
            </CardTitle>
            <CardDescription>
              p75 / p95 latency by route, captured in real users' browsers via the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">record-web-vital</code>{" "}
              beacon. Routes need at least 5 samples to appear.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={windowHours} onValueChange={setWindowHours}>
              <SelectTrigger className="w-[160px]" aria-label="Time window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh metrics"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2" role="status" aria-label="Loading metrics">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive" role="alert">
              Failed to load metrics. Try refreshing.
            </p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No samples in this window yet. RUM beacons start streaming as soon as real users load
              pages with the latest deploy. (Routes appear after 5 samples.)
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {totalSamples.toLocaleString()} samples across {grouped.length} route
                {grouped.length === 1 ? "" : "s"} in the last {WINDOW_OPTIONS.find((o) => o.value === windowHours)?.label.toLowerCase()}.
              </p>
              <div className="space-y-6">
                {grouped.map(([route, rows]) => (
                  <div key={route}>
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="font-mono text-sm font-medium">{route}</h3>
                      <span className="text-xs text-muted-foreground">
                        {rows.reduce((s, r) => s + r.sample_count, 0).toLocaleString()} samples
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-md border border-border/50">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">Metric</TableHead>
                            <TableHead className="w-[120px]">p75</TableHead>
                            <TableHead className="w-[120px]">p95</TableHead>
                            <TableHead className="w-[110px]">Rating</TableHead>
                            <TableHead className="w-[100px] text-right">% good</TableHead>
                            <TableHead className="text-right">Samples</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows
                            .slice()
                            .sort((a, b) => a.metric_name.localeCompare(b.metric_name))
                            .map((row) => (
                              <TableRow key={`${row.route}-${row.metric_name}`}>
                                <TableCell className="font-medium">{row.metric_name}</TableCell>
                                <TableCell className="font-mono text-sm">
                                  {formatValue(row.metric_name, row.p75)}
                                </TableCell>
                                <TableCell className="font-mono text-sm text-muted-foreground">
                                  {formatValue(row.metric_name, row.p95)}
                                </TableCell>
                                <TableCell>{ratingBadge(ratingFor(row.metric_name, row.p75))}</TableCell>
                                <TableCell className="text-right text-sm">
                                  {row.good_pct?.toFixed(0) ?? "—"}%
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {row.sample_count.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
