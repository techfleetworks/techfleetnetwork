import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import {
  Handshake, ExternalLink, LayoutGrid, List, Loader2, Eye, CheckCircle2,
  Rocket, PlayCircle, Clock, Briefcase,
} from "lucide-react";
import { StatsService, type NetworkStats } from "@/services/stats.service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
  userApplied: boolean;
}

const VISIBLE_STATUSES: Array<"coming_soon" | "apply_now" | "recruiting" | "team_onboarding" | "project_in_progress"> = ["coming_soon", "apply_now", "recruiting", "team_onboarding", "project_in_progress"];

export default function ProjectOpeningsPage() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [view, setView] = useState<"card" | "table">("card");
  const [stats, setStats] = useState<NetworkStats | null>(null);

  useEffect(() => {
    StatsService.getNetworkStats().then(setStats).catch(() => {});
  }, []);

  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ["project-openings-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, client_id, project_type, phase, project_status, team_hats, current_phase_milestones")
        .in("project_status", [...VISIBLE_STATUSES])
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

  const enrichedProjects = useMemo<EnrichedProject[]>(() =>
    projects.map((p) => {
      const stats = statsMap.get(p.id);
      return {
        ...p,
        clientName: clientMap.get(p.client_id) ?? "Client",
        totalApps: stats?.total ?? 0,
        hatCounts: stats?.hatCounts ?? {},
        userApplied: appliedProjectIds.has(p.id),
      };
    }),
    [projects, clientMap, statsMap, appliedProjectIds]
  );

  /* ── Split into sections ─────────────────────────────────── */
  const comingSoon = useMemo(() => enrichedProjects.filter((p) => p.project_status === "coming_soon"), [enrichedProjects]);
  const openApplications = useMemo(() => enrichedProjects.filter((p) => p.project_status === "apply_now"), [enrichedProjects]);
  const startingSoon = useMemo(() => enrichedProjects.filter((p) => p.project_status === "recruiting" || p.project_status === "team_onboarding"), [enrichedProjects]);
  const liveProjects = useMemo(() => enrichedProjects.filter((p) => p.project_status === "project_in_progress"), [enrichedProjects]);

  const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
  const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
  const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

  const columnDefs = useMemo<ColDef<EnrichedProject>[]>(() => [
    { headerName: "Client", field: "clientName", flex: 2 },
    { headerName: "Project Type", flex: 1, valueGetter: (params) => typeLabel(params.data?.project_type ?? "") },
    { headerName: "Phase", flex: 1, valueGetter: (params) => phaseLabel(params.data?.phase ?? "") },
    { headerName: "Status", flex: 1, valueGetter: (params) => statusLabel(params.data?.project_status ?? "") },
    {
      headerName: "Your Status",
      flex: 1,
      minWidth: 110,
      valueGetter: (params) => params.data?.userApplied ? "Applied" : "Not Applied",
      cellStyle: (params) => ({
        color: params.value === "Applied" ? "hsl(var(--primary))" : undefined,
        fontWeight: params.value === "Applied" ? 600 : undefined,
      }),
    },
    { headerName: "Team Hats", flex: 2, valueGetter: (params) => (params.data?.team_hats ?? []).join(", ") },
    { headerName: "Applications", field: "totalApps", flex: 0.8, minWidth: 110 },
    ...TEAM_HATS.map((hat) => ({
      headerName: hat,
      flex: 0.7,
      minWidth: 90,
      valueGetter: (params: { data?: EnrichedProject }) => params.data?.hatCounts[hat] ?? 0,
    } as ColDef<EnrichedProject>)),
  ], [clientMap]);

  /* ── Project Card ────────────────────────────────────────── */
  function ProjectCard({ p }: { p: EnrichedProject }) {
    return (
      <Card className="flex flex-col h-full cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/project-openings/${p.id}`)}>
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
            {p.userApplied ? (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" /> Applied
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Not Applied</Badge>
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
          {p.team_hats.length > 0 && (
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
          <Button variant="outline" className="w-full gap-2" onClick={(e) => { e.stopPropagation(); navigate(`/project-openings/${p.id}`); }}>
            <Eye className="h-4 w-4" /> View
          </Button>
        </CardFooter>
      </Card>
    );
  }

  /* ── Section renderer ────────────────────────────────────── */
  function ProjectSection({ icon: Icon, items, emptyText }: { icon: React.ElementType; items: EnrichedProject[]; emptyText: string }) {
    if (items.length === 0) return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <Icon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((p) => <div key={p.id}><ProjectCard p={p} /></div>)}
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Project Openings</h1>
        <p className="text-muted-foreground mt-1">
          Browse current openings for client project training and volunteer teams.
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <div className="card-elevated p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-5 w-5 text-success" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-tight">{stats.projects_open_applications}</p>
              <p className="text-xs text-muted-foreground">Open Applications</p>
            </div>
          </div>
          <div className="card-elevated p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-warning" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-tight">{stats.projects_coming_soon}</p>
              <p className="text-xs text-muted-foreground">Opening Soon</p>
            </div>
          </div>
          <div className="card-elevated p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
              <Rocket className="h-5 w-5 text-info" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-tight">{startingSoon.length}</p>
              <p className="text-xs text-muted-foreground">Starting Soon</p>
            </div>
          </div>
          <div className="card-elevated p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <PlayCircle className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-tight">{stats.projects_live}</p>
              <p className="text-xs text-muted-foreground">Live</p>
            </div>
          </div>
          <div className="card-elevated p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-tight">{stats.projects_previously_completed}</p>
              <p className="text-xs text-muted-foreground">Previously Completed</p>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="client" className="w-full">
        <TabsList className="w-full sm:w-auto mb-6">
          <TabsTrigger value="client" className="flex-1 sm:flex-none gap-2">
            Client Project Openings
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold text-white ${openApplications.length > 0 ? "bg-[#1d4ed8]" : "bg-[#52525b]"}`}>
              {openApplications.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="volunteer" className="flex-1 sm:flex-none gap-2">
            Volunteer Openings
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold text-white bg-[#52525b]">
              0
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client">
          {enrichedProjects.length > 0 && (
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
          ) : enrichedProjects.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">No Openings Right Now</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                There are no client projects currently available. Check back soon or visit the guide for more details.
              </p>
              <a href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/project-training-openings" target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-1.5" />View on Guide
                </Button>
              </a>
            </div>
          ) : view === "table" ? (
            <ThemedAgGrid<EnrichedProject>
              gridId="project-openings"
              height="400px"
              rowData={enrichedProjects}
              columnDefs={columnDefs}
              getRowId={(params) => params.data.id}
              onRowClicked={(params) => {
                if (!params.data) return;
                navigate(`/project-openings/${params.data.id}`);
              }}
              rowStyle={{ cursor: "pointer" }}
              showExportCsv={isAdmin}
              exportFileName="project-openings"
            />
          ) : (
            <div className="space-y-10">
              {/* Open Applications — first */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-success" aria-hidden="true" />
                  Open Applications
                </h3>
                <ProjectSection icon={Handshake} items={openApplications} emptyText="No projects are currently accepting applications." />
              </div>

              {/* Opening Soon — renamed, moved under Open Applications */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" aria-hidden="true" />
                  Opening Soon
                </h3>
                <ProjectSection icon={Clock} items={comingSoon} emptyText="No projects are opening soon." />
              </div>

              {/* Starting Soon */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-info" aria-hidden="true" />
                  Starting Soon
                </h3>
                <ProjectSection icon={Rocket} items={startingSoon} emptyText="No projects are starting soon." />
              </div>

              {/* Live Projects */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" aria-hidden="true" />
                  Live Projects
                </h3>
                <ProjectSection icon={PlayCircle} items={liveProjects} emptyText="No projects are currently in progress." />
              </div>
            </div>
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
    </div>
  );
}
