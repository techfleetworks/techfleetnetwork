import React, { lazy, Suspense, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveTabs, ResponsiveTabsList, ResponsiveTabsContent, type TabItem } from "@/components/ui/responsive-tabs";
import { Loader2, ShieldAlert, FolderKanban, Users } from "lucide-react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";

const ProjectAnalysisContent = lazy(() => import("@/components/admin/ProjectAnalysisContent"));
const ProjectRosterContent = lazy(() => import("@/components/admin/ProjectRosterContent"));

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

const rosterTabs: TabItem[] = [
  { value: "analysis", label: "Application Analysis" },
  { value: "roster", label: "Project Roster" },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function RosterProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [tab, setTab] = useState("analysis");

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["roster-project-detail", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_type, phase, project_status, team_hats, client_id, friendly_name, description, clients(name)")
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
        friendly_name?: string;
        description?: string;
        clients: { name: string } | null;
      };
    },
    enabled: !!projectId && !!user && isAdmin,
  });

  const { data: appCount = 0 } = useQuery({
    queryKey: ["roster-project-app-count", projectId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("project_applications")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId!)
        .eq("status", "completed");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!projectId && !!user && isAdmin,
  });

  const baseClientName = project?.clients?.name ?? "Project";
  const clientName = project?.friendly_name?.trim()
    ? `${baseClientName} — ${project.friendly_name}`
    : baseClientName;
  const isLoading = adminLoading || projLoading;

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
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/roster">Recruiting Center</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{clientName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{clientName}</h1>
        {project.description?.trim() && (
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">{project.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="secondary">{typeLabel(project.project_type)}</Badge>
          <Badge variant="outline">{phaseLabel(project.phase)}</Badge>
          <Badge variant="outline">{statusLabel(project.project_status)}</Badge>
          <Badge variant="default" className="gap-1">
            <Users className="h-3 w-3" />
            {appCount} {appCount === 1 ? "applicant" : "applicants"}
          </Badge>
        </div>
      </div>

      <ResponsiveTabs value={tab} onValueChange={setTab}>
        <ResponsiveTabsList tabs={rosterTabs} value={tab} onValueChange={setTab} />
        <ResponsiveTabsContent value="analysis" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <ProjectAnalysisContent projectId={projectId!} />
          </Suspense>
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="roster" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <ProjectRosterContent projectId={projectId!} />
          </Suspense>
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}
