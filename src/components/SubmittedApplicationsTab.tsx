import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { LayoutGrid, LayoutList, ExternalLink, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";

interface SubmittedApp {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
  completed_at: string | null;
  participated_previous_phase: boolean;
  team_hats_interest: string[];
}

interface ProjectRow {
  id: string;
  project_type: string;
  phase: string;
  project_status: string;
  client_id: string;
}

interface ClientRow {
  id: string;
  name: string;
}

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

export default function SubmittedApplicationsTab() {
  const navigate = useNavigate();
  const [view, setView] = useState<"card" | "table">("table");

  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ["admin-submitted-project-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("*")
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SubmittedApp[];
    },
  });

  const projectIds = useMemo(() => [...new Set((apps ?? []).map((a) => a.project_id))], [apps]);
  const { data: projects } = useQuery({
    queryKey: ["admin-projects-for-apps", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("projects").select("*").in("id", projectIds);
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
    enabled: projectIds.length > 0,
  });

  const clientIds = useMemo(() => [...new Set((projects ?? []).map((p) => p.client_id))], [projects]);
  const { data: clients } = useQuery({
    queryKey: ["admin-clients-for-apps", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("clients").select("*").in("id", clientIds);
      if (error) throw error;
      return (data ?? []) as unknown as ClientRow[];
    },
    enabled: clientIds.length > 0,
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles-for-apps", apps?.map((a) => a.user_id)],
    queryFn: async () => {
      const userIds = [...new Set((apps ?? []).map((a) => a.user_id))];
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles").select("user_id, display_name, first_name, last_name, email").in("user_id", userIds);
      if (error) throw error;
      return (data ?? []) as { user_id: string; display_name: string; first_name: string; last_name: string; email: string }[];
    },
    enabled: (apps ?? []).length > 0,
  });

  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);
  const profileMap = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p])), [profiles]);

  const enriched = useMemo(() => {
    const items = (apps ?? []).map((a) => {
      const proj = projectMap.get(a.project_id);
      const cli = proj ? clientMap.get(proj.client_id) : undefined;
      const prof = profileMap.get(a.user_id);
      return { ...a, project: proj, client: cli, profile: prof };
    });

    // Count per user how many apply_now project apps they have
    const userApplyNowCounts = new Map<string, number>();
    for (const item of items) {
      if (item.project?.project_status === "apply_now") {
        userApplyNowCounts.set(item.user_id, (userApplyNowCounts.get(item.user_id) ?? 0) + 1);
      }
    }

    return items.map((item) => ({
      ...item,
      otherApplyNowCount: item.project?.project_status === "apply_now"
        ? (userApplyNowCounts.get(item.user_id) ?? 1) - 1
        : userApplyNowCounts.get(item.user_id) ?? 0,
      totalApplyNowCount: userApplyNowCounts.get(item.user_id) ?? 0,
    }));
  }, [apps, projectMap, clientMap, profileMap]);

  if (appsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (enriched.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No submitted applications yet</p>
        <p className="text-sm mt-1">Completed project applications will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex justify-end">
        <div className="flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setView("card")}
            className={`p-2 transition-colors ${view === "card" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("table")}
            className={`p-2 transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            aria-label="Table view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view === "card" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {enriched.map((app) => (
            <Card
              key={app.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/admin/applications/${app.id}`)}
            >
              <CardContent className="pt-5 space-y-3">
                {/* Applicant */}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {app.profile?.display_name || `${app.profile?.first_name ?? ""} ${app.profile?.last_name ?? ""}`.trim() || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">{app.profile?.email}</p>
                </div>

                {/* Project / Client */}
                <div className="space-y-1">
                  <p className="text-sm text-foreground font-medium">{app.client?.name ?? "Unknown Client"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">{typeLabel(app.project?.project_type ?? "")}</Badge>
                    <Badge variant="outline" className="text-xs">{phaseLabel(app.project?.phase ?? "")}</Badge>
                    <Badge variant="secondary" className="text-xs">{statusLabel(app.project?.project_status ?? "")}</Badge>
                  </div>
                </div>

                {/* Previous participant */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {app.participated_previous_phase
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Previous Participant</>
                    : <><XCircle className="h-3.5 w-3.5 text-muted-foreground/60" /> New Participant</>}
                </div>

                {/* Other Apply Now apps */}
                {app.totalApplyNowCount > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    <span className="text-warning font-medium">
                      {app.otherApplyNowCount} other active {app.otherApplyNowCount === 1 ? "application" : "applications"}
                    </span>
                  </div>
                )}

                {/* Date */}
                {app.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    Submitted {format(new Date(app.completed_at), "MMM d, yyyy")}
                  </p>
                )}

                <Button variant="outline" size="sm" className="w-full mt-2 gap-1">
                  View Full Application <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Project Type</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Previous Participant?</TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4">Other Active Apps</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">Number of other submitted applications this person has for projects currently accepting applications (Apply Now)</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead>Date Submitted</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.map((app) => (
                <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/applications/${app.id}`)}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground text-sm">
                        {app.profile?.display_name || `${app.profile?.first_name ?? ""} ${app.profile?.last_name ?? ""}`.trim() || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">{app.profile?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{app.client?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{typeLabel(app.project?.project_type ?? "")}</TableCell>
                  <TableCell className="text-sm">{phaseLabel(app.project?.phase ?? "")}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{statusLabel(app.project?.project_status ?? "")}</Badge></TableCell>
                  <TableCell>
                    {app.participated_previous_phase
                      ? <Badge className="bg-success/10 text-success border-success/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Yes</Badge>
                      : <span className="text-sm text-muted-foreground">No</span>}
                  </TableCell>
                  <TableCell className="text-sm">{app.completed_at ? format(new Date(app.completed_at), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1">
                      View <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
