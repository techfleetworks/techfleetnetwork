/**
 * IncidentsTab — GDPR Art. 33 / 34 breach response console.
 *
 * Admins can open a new incident (severity, jurisdictions, affected count). The
 * `open_incident` SECURITY DEFINER RPC seeds drafts for both the regulator and
 * the user notice and starts the 72-hour clock (`notification_due_at`).
 *
 * The list view shows every open incident with a live countdown so the on-call
 * admin always knows exactly how long they have left to notify regulators.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Clock, Plus, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IncidentRow {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  affected_user_count: number;
  jurisdictions: string[];
  notification_due_at: string;
  notified_regulators_at: string | null;
  notified_users_at: string | null;
  resolved_at: string | null;
  draft_regulator_notice: string | null;
  draft_user_notice: string | null;
  created_at: string;
}

function countdown(due: string, resolved: string | null): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  if (resolved) return { label: "Resolved", tone: "outline" };
  const ms = new Date(due).getTime() - Date.now();
  if (ms < 0) {
    const h = Math.abs(Math.round(ms / 3_600_000));
    return { label: `Overdue ${h}h`, tone: "destructive" };
  }
  const h = Math.round(ms / 3_600_000);
  return { label: `${h}h left`, tone: h <= 12 ? "destructive" : h <= 24 ? "default" : "secondary" };
}

const SEV_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
  critical: "destructive",
};

export function IncidentsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IncidentRow | null>(null);
  const [form, setForm] = useState({
    severity: "high" as IncidentRow["severity"],
    title: "",
    description: "",
    affected: 0,
    jurisdictions: "EU,UK",
  });
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_response")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as IncidentRow[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  const openCount = useMemo(() => (data ?? []).filter((r) => !r.resolved_at).length, [data]);

  async function createIncident() {
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: "Title and description are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("open_incident", {
        _severity: form.severity,
        _title: form.title.trim(),
        _description: form.description.trim(),
        _affected_user_count: Number(form.affected) || 0,
        _jurisdictions: form.jurisdictions.split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (error) throw error;
      toast({ title: "Incident opened", description: "72-hour notification clock has started." });
      setOpen(false);
      setForm({ severity: "high", title: "", description: "", affected: 0, jurisdictions: "EU,UK" });
      qc.invalidateQueries({ queryKey: ["admin-incidents"] });
    } catch (e) {
      toast({ title: "Could not open incident", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function patchIncident(patch: Partial<IncidentRow>) {
    if (!selected) return;
    const { error } = await supabase.from("incident_response").update(patch).eq("id", selected.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-incidents"] });
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Open incidents</CardDescription></CardHeader>
          <CardContent><p className={`text-2xl font-semibold ${openCount > 0 ? "text-destructive" : ""}`}>{openCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Regulator SLA</CardDescription></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">72 hours from awareness (GDPR Art. 33)</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Open new incident</CardDescription></CardHeader>
          <CardContent>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> New incident</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">Open incident</DialogTitle>
                  <DialogDescription>Starts the 72-hour regulator notification clock.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="inc-title">Title</Label>
                    <Input id="inc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
                  </div>
                  <div>
                    <Label htmlFor="inc-desc">Description</Label>
                    <Textarea id="inc-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} maxLength={5000} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="inc-sev">Severity</Label>
                      <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as IncidentRow["severity"] })}>
                        <SelectTrigger id="inc-sev"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="inc-aff">Affected users</Label>
                      <Input id="inc-aff" type="number" min={0} value={form.affected} onChange={(e) => setForm({ ...form, affected: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="inc-juris">Jurisdictions (comma-separated)</Label>
                    <Input id="inc-juris" value={form.jurisdictions} onChange={(e) => setForm({ ...form, jurisdictions: e.target.value })} placeholder="EU, UK, CA, BR" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={createIncident} disabled={submitting}>{submitting ? "Opening…" : "Open incident"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Active &amp; recent incidents</CardTitle>
          <CardDescription>Live 72-hour regulator countdown shown for unresolved incidents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground">No incidents on file. ✅</p>
          ) : (
            data.map((row) => {
              const cd = countdown(row.notification_due_at, row.resolved_at);
              return (
                <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between border rounded p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={SEV_TONE[row.severity]}>{row.severity}</Badge>
                      <p className="font-medium">{row.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Affected: {row.affected_user_count.toLocaleString()} · Jurisdictions: {row.jurisdictions.join(", ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cd.tone} className="gap-1"><Clock className="h-3 w-3" /> {cd.label}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>Open</Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>Severity {selected?.severity} · opened {selected ? new Date(selected.created_at).toLocaleString() : ""}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium mb-1">Summary</p>
                <p className="whitespace-pre-wrap">{selected.description}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="border rounded p-3 bg-muted/30">
                  <p className="font-medium text-xs uppercase mb-1">Draft — regulator</p>
                  <pre className="text-xs whitespace-pre-wrap">{selected.draft_regulator_notice ?? "—"}</pre>
                </div>
                <div className="border rounded p-3 bg-muted/30">
                  <p className="font-medium text-xs uppercase mb-1">Draft — user</p>
                  <pre className="text-xs whitespace-pre-wrap">{selected.draft_user_notice ?? "—"}</pre>
                </div>
              </div>
              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" disabled={!!selected.notified_regulators_at}
                        onClick={() => patchIncident({ notified_regulators_at: new Date().toISOString() } as Partial<IncidentRow>)}>
                  {selected.notified_regulators_at ? "✓ Regulators notified" : "Mark regulators notified"}
                </Button>
                <Button variant="outline" disabled={!!selected.notified_users_at}
                        onClick={() => patchIncident({ notified_users_at: new Date().toISOString() } as Partial<IncidentRow>)}>
                  {selected.notified_users_at ? "✓ Users notified" : "Mark users notified"}
                </Button>
                <Button variant="default" disabled={!!selected.resolved_at}
                        onClick={() => patchIncident({ resolved_at: new Date().toISOString() } as Partial<IncidentRow>)}>
                  {selected.resolved_at ? "✓ Resolved" : "Mark resolved"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
