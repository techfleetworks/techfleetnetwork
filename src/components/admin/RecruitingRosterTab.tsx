import { useMemo } from "react";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, FolderKanban } from "lucide-react";
import { ThemedAgGrid } from "@/components/AgGrid";
import { format } from "date-fns";
import type { ColDef } from "ag-grid-community";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

interface ProjectWithClient {
  id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  client_id: string;
  clients: { name: string } | null;
}

interface ProfileRow {
  user_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AppRow {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
  team_hats_interest: string[];
  completed_at: string | null;
  created_at: string;
}

interface EnrichedApp extends AppRow {
  applicantName: string;
  applicantEmail: string;
  hats: string;
}

export default function RecruitingRosterTab() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();

  const { data: projects, isLoading: projLoading } = useQuery({
    queryKey: ["roster-all-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_type, phase, project_status, team_hats, client_id, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectWithClient[];
    },
    enabled: !!user && isAdmin,
  });

  const { data: allApps, isLoading: appsLoading } = useQuery({
    queryKey: ["roster-all-project-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("id, user_id, project_id, status, team_hats_interest, completed_at, created_at")
        .eq("status", "completed");
      if (error) throw error;
      return (data ?? []) as unknown as AppRow[];
    },
    enabled: !!user && isAdmin,
  });

  const userIds = useMemo(
    () => [...new Set((allApps ?? []).map((a) => a.user_id))],
    [allApps]
  );

  const { data: profiles } = useQuery({
    queryKey: ["roster-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, email")
        .in("user_id", userIds);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: userIds.length > 0,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    for (const p of profiles ?? []) m.set(p.user_id, p);
    return m;
  }, [profiles]);

  const appsByProject = useMemo(() => {
    const map = new Map<string, EnrichedApp[]>();
    for (const app of allApps ?? []) {
      const profile = profileMap.get(app.user_id);
      const enriched: EnrichedApp = {
        ...app,
        applicantName: profile?.display_name || `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Unknown",
        applicantEmail: profile?.email ?? "",
        hats: app.team_hats_interest.join(", "),
      };
      const existing = map.get(app.project_id) ?? [];
      existing.push(enriched);
      map.set(app.project_id, existing);
    }
    return map;
  }, [allApps, profileMap]);

  const columnDefs = useMemo<ColDef<EnrichedApp>[]>(() => [
    { headerName: "Applicant", field: "applicantName", flex: 2, minWidth: 150, filter: true },
    { headerName: "Email", field: "applicantEmail", flex: 2, minWidth: 180, filter: true },
    { headerName: "Hats of Interest", field: "hats", flex: 2.5, minWidth: 200, filter: true },
    {
      headerName: "Submitted",
      field: "completed_at",
      flex: 1.2,
      minWidth: 130,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },
  ], []);

  const isLoading = projLoading || appsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-40" aria-hidden="true" />
        <p className="text-lg font-medium">No projects yet</p>
        <p className="text-sm mt-1">Create projects from Clients and Projects to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        All projects and their completed applicants.
      </p>

      {projects.map((project) => {
        const apps = appsByProject.get(project.id) ?? [];
        return (
          <Card key={project.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  {project.clients?.name ?? "Unknown Client"}
                  <span className="text-muted-foreground font-normal text-sm">
                    — {typeLabel(project.project_type)}
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {phaseLabel(project.phase)}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {statusLabel(project.project_status)}
                  </Badge>
                  <Badge variant="default" className="text-xs gap-1">
                    <Users className="h-3 w-3" />
                    {apps.length} {apps.length === 1 ? "applicant" : "applicants"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {apps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No completed applications for this project yet.
                </p>
              ) : (
                <ThemedAgGrid<EnrichedApp>
                  gridId={`roster-${project.id}`}
                  height={apps.length <= 5 ? "240px" : "360px"}
                  rowData={apps}
                  columnDefs={columnDefs}
                  getRowId={(p) => p.data.id}
                  pagination
                  paginationPageSize={10}
                  showExportCsv
                  exportFileName={`roster-${project.clients?.name ?? "project"}`}
                  hideResetButton
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
