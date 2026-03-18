import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import {
  Handshake, ExternalLink, LayoutGrid, List, Loader2, Send, Pencil, CheckCircle2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES, TEAM_HATS,
} from "@/data/project-constants";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef } from "ag-grid-community";

interface OpenProject {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
}

interface ClientInfo {
  id: string;
  name: string;
}

interface ProjectAppStat {
  project_id: string;
  team_hats_interest: string[];
}

interface EnrichedProject extends OpenProject {
  clientName: string;
  totalApps: number;
  hatCounts: Record<string, number>;
  userStatus: "Apply Now" | "Applied";
}

const SECTION_LABELS = [
  "Introduction",
  "Profile Review",
  "Engagement History",
  "Agile Mindset",
  "Servant Leadership",
];

export default function ProjectOpeningsPage() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [view, setView] = useState<"card" | "table">("card");
  const [gateDialogOpen, setGateDialogOpen] = useState(false);
  const [appSection, setAppSection] = useState(1);
  const [hasApp, setHasApp] = useState(false);

  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ["project-openings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, client_id, project_type, phase, project_status, team_hats, current_phase_milestones")
        .eq("project_status", "apply_now")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpenProject[];
    },
  });

  const clientIds = useMemo(() => [...new Set(projects.map((p) => p.client_id))], [projects]);
  const { data: clients = [] } = useQuery({
    queryKey: ["project-opening-clients", clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const { data, error } = await supabase.from("clients").select("id, name").in("id", clientIds);
      if (error) throw error;
      return (data ?? []) as ClientInfo[];
    },
    enabled: clientIds.length > 0,
  });

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  /* Fetch submitted application stats for all open projects */
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { data: appStats = [] } = useQuery({
    queryKey: ["project-opening-app-stats", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("project_applications")
        .select("project_id, team_hats_interest")
        .in("project_id", projectIds)
        .eq("status", "completed");
      if (error) throw error;
      return (data ?? []) as ProjectAppStat[];
    },
    enabled: projectIds.length > 0,
  });

  /* Compute per-project stats */
  const statsMap = useMemo(() => {
    const map = new Map<string, { total: number; hatCounts: Record<string, number> }>();
    for (const stat of appStats) {
      let entry = map.get(stat.project_id);
      if (!entry) {
        entry = { total: 0, hatCounts: {} };
        map.set(stat.project_id, entry);
      }
      entry.total++;
      for (const hat of stat.team_hats_interest) {
        entry.hatCounts[hat] = (entry.hatCounts[hat] ?? 0) + 1;
      }
    }
    return map;
  }, [appStats]);

  const { data: myProjectApps = [] } = useQuery({
    queryKey: ["my-project-apps-for-openings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("id, project_id, status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const appliedProjectIds = useMemo(
    () => new Set(myProjectApps.map((a) => a.project_id)),
    [myProjectApps]
  );

  /* Enriched projects */
  const enrichedProjects = useMemo<EnrichedProject[]>(() =>
    projects.map((p) => {
      const stats = statsMap.get(p.id);
      return {
        ...p,
        clientName: clientMap.get(p.client_id) ?? "Client",
        totalApps: stats?.total ?? 0,
        hatCounts: stats?.hatCounts ?? {},
        userStatus: appliedProjectIds.has(p.id) ? "Applied" as const : "Apply Now" as const,
      };
    }),
    [projects, clientMap, statsMap, appliedProjectIds]
  );

  const { data: genApp } = useQuery({
    queryKey: ["general-app-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("id, status, current_section")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isAppCompleted = genApp?.status === "completed";

  const handleApply = (projectId: string) => {
    if (isAppCompleted) {
      navigate(`/project-openings/${projectId}/apply`);
      return;
    }
    setHasApp(!!genApp);
    setAppSection(genApp?.current_section ?? 1);
    setGateDialogOpen(true);
  };

  const handleGoToApp = () => {
    setGateDialogOpen(false);
    navigate("/applications/general");
  };

  const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
  const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
  const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

  const columnDefs = useMemo<ColDef<EnrichedProject>[]>(() => [
    {
      headerName: "Client",
      field: "clientName",
      flex: 2,
    },
    {
      headerName: "Project Type",
      flex: 1,
      valueGetter: (params) => typeLabel(params.data?.project_type ?? ""),
    },
    {
      headerName: "Phase",
      flex: 1,
      valueGetter: (params) => phaseLabel(params.data?.phase ?? ""),
    },
    {
      headerName: "Status",
      flex: 1,
      valueGetter: (params) => statusLabel(params.data?.project_status ?? ""),
    },
    {
      headerName: "Your Status",
      field: "userStatus",
      flex: 1,
      minWidth: 110,
      cellStyle: (params) => ({
        color: params.value === "Applied" ? "hsl(var(--primary))" : undefined,
        fontWeight: params.value === "Applied" ? 600 : undefined,
      }),
    },
    {
      headerName: "Team Hats",
      flex: 2,
      valueGetter: (params) => (params.data?.team_hats ?? []).join(", "),
    },
    {
      headerName: "Applications",
      field: "totalApps",
      flex: 0.8,
      minWidth: 110,
    },
    /* One column per team hat */
    ...TEAM_HATS.map((hat) => ({
      headerName: hat,
      flex: 0.7,
      minWidth: 90,
      valueGetter: (params: { data?: EnrichedProject }) => params.data?.hatCounts[hat] ?? 0,
    } as ColDef<EnrichedProject>)),
  ], [clientMap]);

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Project Openings</h1>
        <p className="text-muted-foreground mt-1">
          Browse current openings for client project training and volunteer teams.
        </p>
      </div>

      <Tabs defaultValue="client" className="w-full">
        <TabsList className="w-full sm:w-auto mb-6">
          <TabsTrigger value="client" className="flex-1 sm:flex-none">Client Project Openings</TabsTrigger>
          <TabsTrigger value="volunteer" className="flex-1 sm:flex-none">Volunteer Openings</TabsTrigger>
        </TabsList>

        <TabsContent value="client">
          {projects.length > 0 && (
            <div className="flex justify-end mb-4">
              <div className="flex border rounded-md overflow-hidden">
                <Button variant={view === "card" ? "default" : "ghost"} size="sm" onClick={() => setView("card")} aria-label="Card view">
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button variant={view === "table" ? "default" : "ghost"} size="sm" onClick={() => setView("table")} aria-label="Table view">
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {projLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">No Openings Right Now</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                There are no client projects currently accepting applications. Check back soon or visit the guide for more details.
              </p>
              <a href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/project-training-openings" target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-1.5" />View on Guide
                </Button>
              </a>
            </div>
          ) : view === "card" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {enrichedProjects.map((p) => (
                <Card key={p.id} className="flex flex-col cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/project-openings/${p.id}`)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg leading-tight">{p.clientName}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">{typeLabel(p.project_type)}</p>
                      </div>
                      <Badge className="bg-warning/10 text-warning border-warning/20 shrink-0">{statusLabel(p.project_status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 text-sm">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Your Status</p>
                      {p.userStatus === "Applied" ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Applied
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Apply Now</Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Phase</p>
                      <Badge variant="secondary" className="text-xs">{phaseLabel(p.phase)}</Badge>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Team Hats</p>
                      <div className="flex flex-wrap gap-1">
                        {p.team_hats.map((h) => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Total Applications</p>
                      <p className="text-xs text-foreground pl-3 font-medium">{p.totalApps}</p>
                    </div>
                    {/* Per-hat counts — only show hats with > 0 */}
                    {Object.keys(p.hatCounts).length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground mb-1">Applications by Team Hat</p>
                        <div className="space-y-0.5 pl-3">
                          {p.team_hats.map((hat) => (
                            <p key={hat} className="text-xs text-muted-foreground">
                              <span className="text-foreground font-medium">{p.hatCounts[hat] ?? 0}</span> — {hat}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-3 border-t">
                    {appliedProjectIds.has(p.id) ? (
                      <Button variant="outline" className="w-full gap-2" onClick={() => navigate(`/project-openings/${p.id}/apply`)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                    ) : (
                      <Button className="w-full gap-2" onClick={() => handleApply(p.id)}>
                        <Send className="h-4 w-4" /> Apply
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <ThemedAgGrid<EnrichedProject>
              gridId="project-openings"
              height="400px"
              rowData={enrichedProjects}
              columnDefs={columnDefs}
              getRowId={(params) => params.data.id}
              onRowClicked={(params) => {
                if (!params.data) return;
                if (appliedProjectIds.has(params.data.id)) {
                  navigate(`/project-openings/${params.data.id}/apply`);
                } else {
                  handleApply(params.data.id);
                }
              }}
              rowStyle={{ cursor: "pointer" }}
              showExportCsv={isAdmin}
              exportFileName="project-openings"
            />
          )}
        </TabsContent>

        <TabsContent value="volunteer">
          <div className="rounded-lg border bg-card p-8 text-center">
            <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Volunteer Openings</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              View current volunteer team opportunities to support Tech Fleet's mission and operations.
            </p>
            <a href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/volunteer-project-openings" target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-1.5" />View on Guide
              </Button>
            </a>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={gateDialogOpen} onOpenChange={setGateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Your General Application</DialogTitle>
            <DialogDescription>
              Before you can apply to project openings, you need to complete the General Application first.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            {hasApp ? (
              <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  You're currently on <span className="text-primary font-semibold">Section {appSection} of 5</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {SECTION_LABELS[appSection - 1] ?? "Unknown Section"} — pick up where you left off.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You haven't started a General Application yet. Start one now to unlock project applications.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGoToApp}>
              {hasApp ? "Continue Application" : "Start Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
