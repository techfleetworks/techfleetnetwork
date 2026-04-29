import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, HeartPulse, Mail, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/react-query";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { SystemHealthService, type EmailPipelineLog } from "@/services/system-health.service";

const statusVariant = (status: string) => {
  if (["sent", "healthy"].includes(status)) return "default" as const;
  if (["failed", "dlq", "bounced", "complained", "degraded", "overloaded"].includes(status)) return "destructive" as const;
  return "secondary" as const;
};

function relativeTime(value: string | null | undefined) {
  if (!value) return "None";
  return `${formatDistanceToNow(new Date(value), { addSuffix: true })}`;
}

function StatCard({ label, value, detail, tone = "default" }: { label: string; value: number | string; detail: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "border-destructive/40" : tone === "warning" ? "border-warning/40" : "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function LogRow({ log }: { log: EmailPipelineLog }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-3 font-medium text-foreground">{log.template_name}</td>
      <td className="px-3 py-3 text-muted-foreground">{log.recipient_email}</td>
      <td className="px-3 py-3"><Badge variant={statusVariant(log.status)}>{log.status}</Badge></td>
      <td className="px-3 py-3 text-muted-foreground">{relativeTime(log.created_at)}</td>
      <td className="px-3 py-3 text-muted-foreground">{log.error_message || "—"}</td>
    </tr>
  );
}

export default function SystemHealthPage() {
  const { setHeader } = usePageHeader();
  const [hours, setHours] = useState("24");

  useEffect(() => {
    setHeader({
      title: "System Health",
      description: "Email pipeline visibility and platform troubleshooting",
      breadcrumbs: [{ label: "Admin" }, { label: "System Health" }],
    });
    return () => setHeader(null);
  }, [setHeader]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["system-health", "email-pipeline", hours],
    queryFn: () => SystemHealthService.getEmailPipelineHealth(Number(hours), 50),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const totals = data?.delivery_totals;
  const failureRate = useMemo(() => {
    if (!totals?.total) return 0;
    return Math.round(((totals.failed + totals.bounced + totals.complained) / totals.total) * 100);
  }, [totals]);

  if (isLoading && !data) {
    return (
      <section className="container-app py-8" aria-labelledby="system-health-heading">
        <Skeleton className="h-9 w-56 mb-6" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)}
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="container-app py-8" aria-labelledby="system-health-heading">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle id="system-health-heading" className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" />System Health unavailable</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : "The health dashboard could not load."}</CardDescription>
          </CardHeader>
          <CardContent><Button onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="container-app py-8 space-y-6" aria-labelledby="system-health-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 id="system-health-heading" className="text-2xl font-semibold text-foreground">System Health</h1>
          <p className="text-sm text-muted-foreground">Last refreshed {relativeTime(data.generated_at)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Time range">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last hour</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
              <SelectItem value="720">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>

      <Card className={data.health.status === "healthy" ? "border-success/40" : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.health.status === "healthy" ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
            Email Pipeline Status <Badge variant={statusVariant(data.health.status)}>{data.health.status}</Badge>
          </CardTitle>
          <CardDescription>{data.health.reason}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unique Emails" value={totals.total} detail={`Deduplicated over ${data.window_hours}h`} />
        <StatCard label="Sent" value={totals.sent} detail="Successfully handed to the sender" />
        <StatCard label="Pending" value={totals.pending} detail="Waiting or still processing" tone={totals.pending > 0 ? "warning" : "default"} />
        <StatCard label="Failure Rate" value={`${failureRate}%`} detail={`${totals.failed} failed or dead-lettered`} tone={failureRate > 0 ? "danger" : "default"} />
      </div>

      <Tabs defaultValue="queues" className="space-y-4">
        <TabsList aria-label="System health sections">
          <TabsTrigger value="queues">Queues</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="queues" className="grid gap-4 md:grid-cols-2">
          {data.queue_stats.map((queue) => (
            <Card key={queue.queue_name}>
              <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />{queue.queue_name.replace(/_/g, " ")}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Queued</p><p className="text-2xl font-semibold">{queue.queued}</p></div>
                <div><p className="text-muted-foreground">Ready</p><p className="text-2xl font-semibold">{queue.ready}</p></div>
                <div><p className="text-muted-foreground">Retrying</p><p className="text-2xl font-semibold">{queue.delayed_or_inflight}</p></div>
                <div><p className="text-muted-foreground">Max attempts</p><p className="text-2xl font-semibold">{queue.max_attempts}</p></div>
                <div className="col-span-2 text-muted-foreground">Oldest queued: {relativeTime(queue.oldest_enqueued_at)}</div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="delivery"><LogTable logs={data.recent_logs} /></TabsContent>
        <TabsContent value="errors"><ErrorList errors={data.recent_errors} /></TabsContent>
        <TabsContent value="settings">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Processing controls</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div><p className="text-muted-foreground">Batch size</p><p className="text-xl font-semibold">{data.send_state?.batch_size ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Delay between sends</p><p className="text-xl font-semibold">{data.send_state?.send_delay_ms ?? "—"}ms</p></div>
              <div><p className="text-muted-foreground">Rate limit pause</p><p className="text-xl font-semibold">{relativeTime(data.send_state?.retry_after_until)}</p></div>
              <div><p className="text-muted-foreground">Auth email TTL</p><p className="text-xl font-semibold">{data.send_state?.auth_email_ttl_minutes ?? "—"} min</p></div>
              <div><p className="text-muted-foreground">App email TTL</p><p className="text-xl font-semibold">{data.send_state?.transactional_email_ttl_minutes ?? "—"} min</p></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function LogTable({ logs }: { logs: EmailPipelineLog[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Recent email activity</CardTitle><CardDescription>One row per unique email, showing the latest status.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="px-3 py-2">Template</th><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Error</th></tr></thead>
          <tbody>{logs.length ? logs.map((log) => <LogRow key={log.message_id} log={log} />) : <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No email activity in this window.</td></tr>}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ErrorList({ errors }: { errors: Array<{ error_message: string; status: string; occurrences: number; last_seen: string }> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Recent errors</CardTitle><CardDescription>Grouped failures and dead-lettered email events.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {errors.length ? errors.map((item) => (
          <div key={`${item.status}-${item.error_message}-${item.last_seen}`} className="rounded-lg border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
              <span className="text-xs text-muted-foreground">{item.occurrences} occurrences · {relativeTime(item.last_seen)}</span>
            </div>
            <p className="mt-2 text-sm text-foreground">{item.error_message}</p>
          </div>
        )) : <p className="text-sm text-muted-foreground">No recent email errors in this window.</p>}
      </CardContent>
    </Card>
  );
}