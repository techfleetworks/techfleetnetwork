import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert, Users, FolderKanban } from "lucide-react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemedAgGrid } from "@/components/AgGrid";
import { format } from "date-fns";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";
import { ApplicantStatusDropdown, applicantStatusLabel } from "@/components/admin/ApplicantStatusDropdown";

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

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
  applicant_status: string;
  team_hats_interest: string[];
  completed_at: string | null;
  created_at: string;
}

interface EnrichedApp extends AppRow {
  applicantName: string;
  applicantFirstName: string;
  applicantEmail: string;
  hats: string;
}

export default function RosterProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["roster-project-detail", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_type, phase, project_status, team_hats, client_id, clients(name)")
        .eq("id", projectId!)
        .single();
      if (error) throw error;
      return data as unknown as {
        id: string;
        project_type: string;
        phase: string;
        project_status: string;
        team_hats: string[];
        client_id: string;
        clients: { name: string } | null;
      };
    },
    enabled: !!projectId && !!user && isAdmin,
  });

  const { data: apps, isLoading: appsLoading } = useQuery({
    queryKey: ["roster-project-apps", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("id, user_id, project_id, status, applicant_status, team_hats_interest, completed_at, created_at")
        .eq("project_id", projectId!)
        .eq("status", "completed");
      if (error) throw error;
      return (data ?? []) as unknown as AppRow[];
    },
    enabled: !!projectId && !!user && isAdmin,
  });

  const userIds = useMemo(
    () => [...new Set((apps ?? []).map((a) => a.user_id))],
    [apps]
  );

  const { data: profiles } = useQuery({
    queryKey: ["roster-project-profiles", userIds],
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

  const enrichedApps = useMemo<EnrichedApp[]>(() => {
    return (apps ?? []).map((app) => {
      const profile = profileMap.get(app.user_id);
      return {
        ...app,
        applicantName: profile?.display_name || `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Unknown",
        applicantFirstName: profile?.first_name ?? "",
        applicantEmail: profile?.email ?? "",
        hats: app.team_hats_interest.join(", "),
      };
    });
  }, [apps, profileMap]);

  const columnDefs = useMemo<ColDef<EnrichedApp>[]>(() => [
    { headerName: "Applicant", field: "applicantName", flex: 2, minWidth: 150, filter: true },
    { headerName: "Email", field: "applicantEmail", flex: 2, minWidth: 180, filter: true },
    { headerName: "Hats of Interest", field: "hats", flex: 2.5, minWidth: 200, filter: true },
    {
      headerName: "Status",
      field: "applicant_status",
      flex: 1.5,
      minWidth: 140,
      filter: true,
      valueFormatter: (p) => applicantStatusLabel(p.value ?? "pending_review"),
    },
    {
      headerName: "Submitted",
      field: "completed_at",
      flex: 1.2,
      minWidth: 130,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },
    {
      headerName: "",
      field: "id",
      width: 80,
      pinned: "right",
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<EnrichedApp>) => {
        const btn = document.createElement("button");
        btn.textContent = "View";
        btn.className = "text-sm font-medium text-primary hover:underline";
        btn.addEventListener("click", () => {
          navigate(`/admin/roster/project/${projectId}/applicant/${params.data!.id}`);
        });
        return btn;
      },
    },
  ], [navigate, projectId]);

  const clientName = project?.clients?.name ?? "Project";
  const isLoading = adminLoading || projLoading || appsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground font-medium">Access denied. Admin role required.</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container-app py-12 text-center">
        <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-40 text-muted-foreground" />
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/roster")}>
          Back to Recruiting Center
        </Button>
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/roster">Recruiting Center</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{clientName} — Project Roster</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{clientName}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="secondary">{typeLabel(project.project_type)}</Badge>
          <Badge variant="outline">{phaseLabel(project.phase)}</Badge>
          <Badge variant="outline">{statusLabel(project.project_status)}</Badge>
          <Badge variant="default" className="gap-1">
            <Users className="h-3 w-3" />
            {enrichedApps.length} {enrichedApps.length === 1 ? "applicant" : "applicants"}
          </Badge>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {enrichedApps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No completed applications for this project yet.
            </p>
          ) : (
            <ThemedAgGrid<EnrichedApp>
              gridId={`roster-detail-${projectId}`}
              height={enrichedApps.length <= 5 ? "280px" : "420px"}
              rowData={enrichedApps}
              columnDefs={columnDefs}
              getRowId={(p) => p.data.id}
              pagination
              paginationPageSize={15}
              showExportCsv
              exportFileName={`roster-${clientName}`}
              hideResetButton
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
