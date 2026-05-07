/**
 * PrivacyRequestsTab — Admin queue for DSAR (Data Subject Access Request) intake.
 *
 * Surfaces every row from `dsar_requests` with the regulatory 30-day SLA badge,
 * the request type (access / erasure / human_review / etc.), and decision
 * controls. Honors the carve-out: completing a request never deletes the row,
 * just sets `status` + `completed_at` + `decision_notes` (kept for the
 * 30-day audit window required by GDPR Art. 12(3) and CCPA §1798.130).
 *
 * Read-only view powered by RLS — admins can update; everyone else is denied.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DsarRow {
  id: string;
  user_id: string | null;
  requester_email: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  jurisdiction: string | null;
  due_at: string;
  created_at: string;
  completed_at: string | null;
  decision_notes: string | null;
}

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  received: "secondary",
  in_review: "default",
  completed: "outline",
  denied: "destructive",
  appealed: "destructive",
};

function dueBadge(row: DsarRow): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  if (row.completed_at) return { label: "Closed", tone: "outline" };
  const ms = new Date(row.due_at).getTime() - Date.now();
  const days = Math.ceil(ms / (24 * 3600 * 1000));
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, tone: "destructive" };
  if (days <= 7) return { label: `${days}d left`, tone: "destructive" };
  if (days <= 14) return { label: `${days}d left`, tone: "default" };
  return { label: `${days}d left`, tone: "secondary" };
}

export function PrivacyRequestsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("open");
  const [selected, setSelected] = useState<DsarRow | null>(null);
  const [decision, setDecision] = useState<string>("");
  const [nextStatus, setNextStatus] = useState<string>("completed");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-dsar", filter],
    queryFn: async () => {
      let q = supabase
        .from("dsar_requests")
        .select("*")
        .order("due_at", { ascending: true });
      if (filter === "open") q = q.in("status", ["received", "in_review", "appealed"]);
      else if (filter === "closed") q = q.in("status", ["completed", "denied"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data as DsarRow[]) ?? [];
    },
    staleTime: 30_000,
  });

  const counts = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      overdue: rows.filter((r) => !r.completed_at && new Date(r.due_at).getTime() < Date.now()).length,
      open: rows.filter((r) => ["received", "in_review", "appealed"].includes(r.status)).length,
    };
  }, [data]);

  async function saveDecision() {
    if (!selected) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        status: nextStatus,
        decision_notes: decision || null,
      };
      if (["completed", "denied"].includes(nextStatus)) patch.completed_at = new Date().toISOString();
      else patch.completed_at = null;
      const { error } = await supabase.from("dsar_requests").update(patch).eq("id", selected.id);
      if (error) throw error;
      toast({ title: "Privacy request updated", description: `Marked ${nextStatus}.` });
      setSelected(null);
      setDecision("");
      qc.invalidateQueries({ queryKey: ["admin-dsar"] });
    } catch (e) {
      toast({ title: "Could not update request", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Open requests</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{counts.open}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Overdue (&gt;30 days)</CardDescription></CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${counts.overdue > 0 ? "text-destructive" : ""}`}>{counts.overdue}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>SLA</CardDescription></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">30 days from intake (GDPR Art. 12(3) / CCPA)</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Privacy requests</CardTitle>
            <CardDescription>Access, erasure, correction, restriction, objection, portability, appeal, and human-review requests.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground">No privacy requests in this view.</p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Filed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => {
                    const sla = dueBadge(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell><Badge variant="outline">{row.type}</Badge></TableCell>
                        <TableCell className="text-sm">{row.requester_email}</TableCell>
                        <TableCell><Badge variant={STATUS_TONE[row.status] ?? "secondary"}>{row.status}</Badge></TableCell>
                        <TableCell><Badge variant={sla.tone}>{sla.label}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setSelected(row); setDecision(row.decision_notes ?? ""); setNextStatus(row.status); }}>Review</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {nextStatus === "completed" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> :
               nextStatus === "denied" ? <AlertTriangle className="h-5 w-5 text-destructive" /> :
               <Clock className="h-5 w-5" />}
              Privacy request — {selected?.type}
            </DialogTitle>
            <DialogDescription>Requester: {selected?.requester_email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border p-3 bg-muted/30">
              <p className="font-medium mb-1">Payload</p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selected?.payload ?? {}, null, 2)}</pre>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New status</label>
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_review">In review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="appealed">Appealed (resets 30-day SLA on linked request)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Decision notes (visible to admins only)</label>
              <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} rows={4} placeholder="What you did, why, and any communications sent." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={saveDecision} disabled={saving}>{saving ? "Saving…" : "Save decision"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
