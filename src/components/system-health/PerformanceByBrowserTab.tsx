/**
 * PerformanceByBrowserTab — RUM browser/device breakdown.
 *
 * Reads `web_vitals_p75_by_browser` RPC (admin-only via has_role check inside
 * the function) and renders a scannable table of p75 by browser × OS ×
 * deviceType × metric, with a privacy floor of ≥10 samples (enforced server
 * side). Companion to PerformanceTab.
 *
 * Tri-layer audit:
 *  [UI]   Browser breakdown table renders for admins only
 *  [Code] Uses `web_vitals_p75_by_browser` RPC
 *  [DB]   RPC SECURITY DEFINER + has_role gate restricts results to admins
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
import { Globe, RefreshCw } from "lucide-react";

type MetricName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";

interface BrowserRow {
  browser_name: string;
  os_name: string;
  device_type: string;
  metric_name: MetricName;
  sample_count: number;
  p75: number;
  p95: number;
  good_pct: number;
}

const GOOD: Record<MetricName, number> = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };
const POOR: Record<MetricName, number> = { LCP: 4000, INP: 500, CLS: 0.25, FCP: 3000, TTFB: 1800 };

function fmt(metric: MetricName, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (metric === "CLS") return v.toFixed(3);
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(2)} s`;
}

function chip(metric: MetricName, v: number) {
  const rating = v <= GOOD[metric] ? "good" : v <= POOR[metric] ? "ni" : "poor";
  const map = {
    good: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    ni: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
    poor: "bg-destructive/15 text-destructive border-destructive/30",
  } as const;
  return (
    <Badge variant="outline" className={map[rating]}>
      {fmt(metric, v)}
    </Badge>
  );
}

const WINDOW_OPTIONS = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
] as const;

const METRICS: MetricName[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];

export function PerformanceByBrowserTab() {
  const [windowHours, setWindowHours] = useState("168");
  const numericWindow = useMemo(() => Number.parseInt(windowHours, 10) || 168, [windowHours]);

  const { data, isLoading, isFetching, refetch, error, dataUpdatedAt } = useQuery({
    queryKey: ["web-vitals-p75-by-browser", numericWindow],
    queryFn: async (): Promise<BrowserRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("web_vitals_p75_by_browser", {
        p_window_hours: numericWindow,
      });
      if (error) throw error;
      return (data ?? []) as BrowserRow[];
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  });


  // Pivot rows: one row per (browser, os, deviceType), columns = metrics
  const pivoted = useMemo(() => {
    const m = new Map<string, { key: string; browser: string; os: string; device: string; metrics: Partial<Record<MetricName, BrowserRow>>; samples: number }>();
    for (const row of data ?? []) {
      const key = `${row.browser_name}|${row.os_name}|${row.device_type}`;
      const entry = m.get(key) ?? {
        key,
        browser: row.browser_name,
        os: row.os_name,
        device: row.device_type,
        metrics: {},
        samples: 0,
      };
      entry.metrics[row.metric_name] = row;
      entry.samples = Math.max(entry.samples, row.sample_count);
      m.set(key, entry);
    }
    return Array.from(m.values()).sort((a, b) => b.samples - a.samples);
  }, [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">By browser & device
            </CardTitle>
            <CardDescription>
              p75 of each Core Web Vital grouped by browser, OS, and device type.
              Combinations with fewer than 10 samples are hidden for privacy.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {dataUpdatedAt ? (
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </span>
            ) : null}

            <Select value={windowHours} onValueChange={setWindowHours}>
              <SelectTrigger className="w-[160px]" aria-label="Time window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh browser breakdown"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2" role="status" aria-label="Loading browser breakdown">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive" role="alert">
              We couldn't load the browser breakdown right now. Try refreshing.
            </p>
          ) : pivoted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No browser combinations have hit the 10-sample privacy floor in this window yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Browser</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Device</TableHead>
                    {METRICS.map((mname) => (
                      <TableHead key={mname} className="w-[110px]">
                        {mname}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Samples</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivoted.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.browser}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.os}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.device}</TableCell>
                      {METRICS.map((mname) => {
                        const cell = r.metrics[mname];
                        return (
                          <TableCell key={mname} className="font-mono text-xs">
                            {cell ? chip(mname, cell.p75) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {r.samples.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
