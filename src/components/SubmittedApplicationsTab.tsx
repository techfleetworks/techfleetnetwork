import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { LayoutGrid, LayoutList, ExternalLink, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef } from "ag-grid-community";

interface ProjectApp {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  current_step: number;
  participated_previous_phase: boolean;
  team_hats_interest: string[];
  passion_for_project: string;
  client_project_knowledge: string;
  project_success_contribution: string;
  cross_functional_contribution: string;
  prior_engagement_preparation: string;
  previous_phase_position: string;
  previous_phase_learnings: string;
  previous_phase_help_teammates: string;
}

interface GeneralApp {
  id: string;
  user_id: string;
  email: string;
  title: string;
  status: string;
  current_section: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  linkedin_url: string;
  portfolio_url: string;
  hours_commitment: string;
  about_yourself: string;
  previous_engagement: string;
  previous_engagement_ways: string[];
  agile_philosophies: string;
  agile_vs_waterfall: string;
  collaboration_challenges: string;
  teammate_learnings: string;
  psychological_safety: string;
  servant_leadership_definition: string;
  servant_leadership_situation: string;
  servant_leadership_actions: string;
  servant_leadership_challenges: string;
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

interface ProfileRow {
  user_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface EnrichedApp extends ProjectApp {
  project?: ProjectRow;
  client?: ClientRow;
  profile?: ProfileRow;
  generalApp?: GeneralApp;
  otherApplyNowCount: number;
  totalApplyNowCount: number;
}

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;
const truncate = (v: string, n = 100) => v && v.length > n ? v.slice(0, n) + "…" : v || "—";

export default function SubmittedApplicationsTab() {
  const navigate = useNavigate();
  const [view, setView] = useState<"card" | "table">("table");

  // Fetch project applications
  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ["admin-submitted-project-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("*")
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectApp[];
    },
  });

  // Fetch general applications
  const { data: generalApps } = useQuery({
    queryKey: ["admin-general-apps-for-submitted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as GeneralApp[];
    },
    enabled: (apps ?? []).length > 0,
  });

  const projectIds = useMemo(() => [...new Set((apps ?? []).map((a) => a.project_id))], [apps]);
  const { data: projects } = useQuery({
    queryKey: ["admin-projects-for-apps", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase.from("projects").select("*").in("id", projectIds);
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
      const { data, error } = await supabase.from("clients").select("*").in("id", clientIds);
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
      return (data ?? []) as ProfileRow[];
    },
    enabled: (apps ?? []).length > 0,
  });

  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);
  const profileMap = useMemo(() => new Map((profiles ?? []).map((p) => [p.user_id, p])), [profiles]);
  const generalAppMap = useMemo(() => {
    const map = new Map<string, GeneralApp>();
    (generalApps ?? []).forEach((g) => map.set(g.user_id, g));
    return map;
  }, [generalApps]);

  const enriched = useMemo<EnrichedApp[]>(() => {
    const items = (apps ?? []).map((a) => {
      const proj = projectMap.get(a.project_id);
      const cli = proj ? clientMap.get(proj.client_id) : undefined;
      const prof = profileMap.get(a.user_id);
      const genApp = generalAppMap.get(a.user_id);
      return { ...a, project: proj, client: cli, profile: prof, generalApp: genApp };
    });
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
  }, [apps, projectMap, clientMap, profileMap, generalAppMap]);

  const columnDefs = useMemo<ColDef<EnrichedApp>[]>(() => [
    // ── Core visible columns ──
    {
      headerName: "Applicant",
      colId: "applicant",
      flex: 2,
      valueGetter: (p) => {
        const pr = p.data?.profile;
        if (!pr) return "Unknown";
        return pr.display_name || `${pr.first_name ?? ""} ${pr.last_name ?? ""}`.trim() || "Unknown";
      },
    },
    {
      headerName: "Email",
      colId: "email",
      flex: 2,
      valueGetter: (p) => p.data?.profile?.email ?? "—",
    },
    {
      headerName: "Client",
      colId: "client",
      flex: 1,
      valueGetter: (p) => p.data?.client?.name ?? "—",
    },
    {
      headerName: "Project Type",
      colId: "project_type",
      flex: 1,
      valueGetter: (p) => typeLabel(p.data?.project?.project_type ?? ""),
    },
    {
      headerName: "Phase",
      colId: "phase",
      flex: 1,
      valueGetter: (p) => phaseLabel(p.data?.project?.phase ?? ""),
    },
    {
      headerName: "Project Status",
      colId: "project_status",
      flex: 1,
      valueGetter: (p) => statusLabel(p.data?.project?.project_status ?? ""),
    },
    {
      headerName: "Previous Participant",
      colId: "prev_participant",
      flex: 1, minWidth: 120,
      valueGetter: (p) => p.data?.participated_previous_phase ? "Yes" : "No",
    },
    {
      headerName: "Other Active Apps",
      colId: "other_apps",
      flex: 1, minWidth: 120,
      valueGetter: (p) => p.data?.otherApplyNowCount ?? 0,
    },
    {
      headerName: "Date Submitted",
      colId: "date_submitted",
      flex: 1, minWidth: 120,
      valueGetter: (p) => p.data?.completed_at,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },

    // ── Project Application fields (hidden by default) ──
    {
      headerName: "Team Hats Interest",
      colId: "pa_team_hats",
      hide: true, flex: 2,
      valueGetter: (p) => (p.data?.team_hats_interest ?? []).join(", "),
    },
    {
      headerName: "Passion for Project",
      colId: "pa_passion",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.passion_for_project ?? ""),
    },
    {
      headerName: "Client/Project Knowledge",
      colId: "pa_client_knowledge",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.client_project_knowledge ?? ""),
    },
    {
      headerName: "Project Success Contribution",
      colId: "pa_success",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.project_success_contribution ?? ""),
    },
    {
      headerName: "Cross-Functional Contribution",
      colId: "pa_cross_func",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.cross_functional_contribution ?? ""),
    },
    {
      headerName: "Prior Engagement Preparation",
      colId: "pa_prior_prep",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.prior_engagement_preparation ?? ""),
    },
    {
      headerName: "Previous Phase Position",
      colId: "pa_prev_position",
      hide: true, flex: 1,
      valueGetter: (p) => truncate(p.data?.previous_phase_position ?? ""),
    },
    {
      headerName: "Previous Phase Learnings",
      colId: "pa_prev_learnings",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.previous_phase_learnings ?? ""),
    },
    {
      headerName: "Previous Phase Help Teammates",
      colId: "pa_prev_help",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.previous_phase_help_teammates ?? ""),
    },
    {
      headerName: "Project App Created",
      colId: "pa_created",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.created_at,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy HH:mm") : "—",
    },
    {
      headerName: "Project App Updated",
      colId: "pa_updated",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.updated_at,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy HH:mm") : "—",
    },
    {
      headerName: "Current Step",
      colId: "pa_step",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.current_step ?? "—",
    },

    // ── General Application fields (hidden by default) ──
    {
      headerName: "GA: Title",
      colId: "ga_title",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.generalApp?.title ?? "—",
    },
    {
      headerName: "GA: Status",
      colId: "ga_status",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.generalApp?.status ?? "—",
    },
    {
      headerName: "GA: LinkedIn",
      colId: "ga_linkedin",
      hide: true, flex: 2,
      valueGetter: (p) => p.data?.generalApp?.linkedin_url ?? "—",
    },
    {
      headerName: "GA: Portfolio",
      colId: "ga_portfolio",
      hide: true, flex: 2,
      valueGetter: (p) => p.data?.generalApp?.portfolio_url ?? "—",
    },
    {
      headerName: "GA: Hours Commitment",
      colId: "ga_hours",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.generalApp?.hours_commitment ?? "—",
    },
    {
      headerName: "GA: About Yourself",
      colId: "ga_about",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.about_yourself ?? ""),
    },
    {
      headerName: "GA: Previous Engagement",
      colId: "ga_prev_engage",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.generalApp?.previous_engagement ?? "—",
    },
    {
      headerName: "GA: Previous Engagement Ways",
      colId: "ga_prev_ways",
      hide: true, flex: 2,
      valueGetter: (p) => (p.data?.generalApp?.previous_engagement_ways ?? []).join(", "),
    },
    {
      headerName: "GA: Agile Philosophies",
      colId: "ga_agile_phil",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.agile_philosophies ?? ""),
    },
    {
      headerName: "GA: Agile vs Waterfall",
      colId: "ga_agile_water",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.agile_vs_waterfall ?? ""),
    },
    {
      headerName: "GA: Collaboration Challenges",
      colId: "ga_collab",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.collaboration_challenges ?? ""),
    },
    {
      headerName: "GA: Teammate Learnings",
      colId: "ga_teammate",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.teammate_learnings ?? ""),
    },
    {
      headerName: "GA: Psychological Safety",
      colId: "ga_psych",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.psychological_safety ?? ""),
    },
    {
      headerName: "GA: Servant Leadership Def.",
      colId: "ga_sl_def",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.servant_leadership_definition ?? ""),
    },
    {
      headerName: "GA: Servant Leadership Sit.",
      colId: "ga_sl_sit",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.servant_leadership_situation ?? ""),
    },
    {
      headerName: "GA: Servant Leadership Actions",
      colId: "ga_sl_actions",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.servant_leadership_actions ?? ""),
    },
    {
      headerName: "GA: Servant Leadership Challenges",
      colId: "ga_sl_challenges",
      hide: true, flex: 2,
      valueGetter: (p) => truncate(p.data?.generalApp?.servant_leadership_challenges ?? ""),
    },
    {
      headerName: "GA: Completed At",
      colId: "ga_completed",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.generalApp?.completed_at,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },
    {
      headerName: "GA: Created At",
      colId: "ga_created",
      hide: true, flex: 1,
      valueGetter: (p) => p.data?.generalApp?.created_at,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },
  ], []);

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
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {app.profile?.display_name || `${app.profile?.first_name ?? ""} ${app.profile?.last_name ?? ""}`.trim() || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">{app.profile?.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-foreground font-medium">{app.client?.name ?? "Unknown Client"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">{typeLabel(app.project?.project_type ?? "")}</Badge>
                    <Badge variant="outline" className="text-xs">{phaseLabel(app.project?.phase ?? "")}</Badge>
                    <Badge variant="secondary" className="text-xs">{statusLabel(app.project?.project_status ?? "")}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {app.participated_previous_phase
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Previous Participant</>
                    : <><XCircle className="h-3.5 w-3.5 text-muted-foreground/60" /> New Participant</>}
                </div>
                {app.totalApplyNowCount > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    <span className="text-warning font-medium">
                      {app.otherApplyNowCount} other active {app.otherApplyNowCount === 1 ? "application" : "applications"}
                    </span>
                  </div>
                )}
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
        <ThemedAgGrid<EnrichedApp>
          gridId="submitted-applications"
          height="500px"
          rowData={enriched}
          columnDefs={columnDefs}
          getRowId={(params) => params.data.id}
          onRowClicked={(params) => params.data && navigate(`/admin/applications/${params.data.id}`)}
          rowStyle={{ cursor: "pointer" }}
          pagination
          paginationPageSize={25}
          sideBar={{
            toolPanels: [
              {
                id: "columns",
                labelDefault: "Columns",
                labelKey: "columns",
                iconKey: "columns",
                toolPanel: "agColumnsToolPanel",
                toolPanelParams: {
                  suppressRowGroups: true,
                  suppressValues: true,
                  suppressPivots: true,
                  suppressPivotMode: true,
                },
              },
            ],
          }}
        />
      )}
    </div>
  );
}
