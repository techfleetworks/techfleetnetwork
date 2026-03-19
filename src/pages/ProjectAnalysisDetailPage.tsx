import { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ThemedAgGrid } from "@/components/AgGrid";
import {
  Loader2, ShieldAlert, CheckCircle2, AlertTriangle, XCircle,
  Users, Target, Info,
} from "lucide-react";
import { PROJECT_TYPES, PROJECT_PHASES } from "@/data/project-constants";
import type { ColDef, GridReadyEvent, GridApi } from "ag-grid-community";

/* ── constants ─────────────────────────────────────── */
const FOUNDATIONAL_HATS = ["Project Management", "Product Management", "UX Research", "UX Design"];
const IDEAL_PER_HAT = 4;
const MIN_PER_HAT = 2;

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;

/* ── interfaces ────────────────────────────────────── */
interface ProjectApp {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  team_hats_interest: string[];
  participated_previous_phase: boolean;
  passion_for_project: string;
  client_project_knowledge: string;
}

interface ProjectInfo {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  clients: { name: string } | null;
}

interface ProfileRow {
  user_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
}

/* ── scoring logic ─────────────────────────────────── */
function computeReadinessScore(
  hatCounts: Map<string, number>,
  projectHats: string[],
  uniqueRatio: number,
  prevPhaseRatio: number,
  phase: string,
): number {
  // 50% weight: foundational hat coverage
  const foundationalPresent = FOUNDATIONAL_HATS.filter((h) => projectHats.includes(h));
  let hatScore = 0;
  if (foundationalPresent.length > 0) {
    const perHatScores = foundationalPresent.map((h) => {
      const count = hatCounts.get(h) ?? 0;
      if (count >= IDEAL_PER_HAT) return 1;
      if (count >= MIN_PER_HAT) return 0.6;
      if (count >= 1) return 0.3;
      return 0;
    });
    hatScore = perHatScores.reduce((s, v) => s + v, 0) / foundationalPresent.length;
  }

  // 20% weight: other hats coverage
  const otherHats = projectHats.filter((h) => !FOUNDATIONAL_HATS.includes(h));
  let otherScore = 1;
  if (otherHats.length > 0) {
    const filled = otherHats.filter((h) => (hatCounts.get(h) ?? 0) >= 1).length;
    otherScore = filled / otherHats.length;
  }

  // 15% weight: unique applicant ratio (higher = better)
  const uniqueScore = uniqueRatio;

  // 15% weight: previous phase participation (phase_1 = full marks)
  const prevScore = phase === "phase_1" ? 1 : prevPhaseRatio;

  return Math.round((hatScore * 0.5 + otherScore * 0.2 + uniqueScore * 0.15 + prevScore * 0.15) * 100);
}

/* ── component ─────────────────────────────────────── */
export default function ProjectAnalysisDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { setHeader } = usePageHeader();
  const gridApiRef = useRef<GridApi | null>(null);

  /* ── data fetching ──────────────────────────────── */
  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["analysis-project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, client_id, project_type, phase, project_status, team_hats, clients(name)")
        .eq("id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProjectInfo | null;
    },
    enabled: !!projectId && !!user && isAdmin,
  });

  const { data: completedApps } = useQuery({
    queryKey: ["analysis-apps-for-project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("*")
        .eq("project_id", projectId!)
        .eq("status", "completed");
      if (error) throw error;
      return (data ?? []) as unknown as ProjectApp[];
    },
    enabled: !!projectId && !!user && isAdmin,
  });

  // All completed project apps (for cross-project analysis)
  const { data: allApps } = useQuery({
    queryKey: ["analysis-all-completed-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("user_id, project_id")
        .eq("status", "completed");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && isAdmin,
  });

  // All apply_now projects for cross-reference
  const { data: applyNowProjects } = useQuery({
    queryKey: ["analysis-apply-now-projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_type, phase, client_id, clients(name)")
        .eq("project_status", "apply_now");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; project_type: string; phase: string; client_id: string; clients: { name: string } | null }[];
    },
    enabled: !!user && isAdmin,
  });

  const userIds = useMemo(() => [...new Set((completedApps ?? []).map((a) => a.user_id))], [completedApps]);

  const { data: profiles } = useQuery({
    queryKey: ["analysis-profiles", userIds],
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

  /* ── breadcrumbs ────────────────────────────────── */
  useEffect(() => {
    setHeader({
      breadcrumbs: [
        { label: "Applications", href: "/applications" },
        { label: "Application Analysis", href: "/applications?tab=analysis" },
        { label: project?.clients?.name ?? "Project Analysis" },
      ],
      title: project ? `${project.clients?.name ?? "Project"} — Analysis` : "Project Analysis",
      description: project ? `${typeLabel(project.project_type)} · ${phaseLabel(project.phase)}` : undefined,
    });
    return () => setHeader(null);
  }, [project, setHeader]);

  /* ── derived data ───────────────────────────────── */
  const analysis = useMemo(() => {
    if (!completedApps || !allApps || !project) return null;

    const totalApplicants = completedApps.length;

    // Hat breakdown
    const hatCounts = new Map<string, number>();
    for (const app of completedApps) {
      for (const hat of app.team_hats_interest) {
        hatCounts.set(hat, (hatCounts.get(hat) ?? 0) + 1);
      }
    }

    // Unique vs shared applicants
    const userOtherProjects = new Map<string, string[]>();
    for (const app of allApps) {
      if (app.project_id !== projectId) {
        const existing = userOtherProjects.get(app.user_id) ?? [];
        existing.push(app.project_id);
        userOtherProjects.set(app.user_id, existing);
      }
    }
    const uniqueApplicants = completedApps.filter((a) => !userOtherProjects.has(a.user_id)).length;
    const sharedApplicants = totalApplicants - uniqueApplicants;
    const uniqueRatio = totalApplicants > 0 ? uniqueApplicants / totalApplicants : 0;

    // Previous phase participation
    const prevPhaseApplicants = completedApps.filter((a) => a.participated_previous_phase).length;
    const prevPhaseRatio = totalApplicants > 0 ? prevPhaseApplicants / totalApplicants : 0;

    // Readiness score
    const readinessScore = computeReadinessScore(hatCounts, project.team_hats, uniqueRatio, prevPhaseRatio, project.phase);

    // Cross-project detail per user
    const userCrossProjectDetail = new Map<string, { projectId: string; clientName: string }[]>();
    for (const app of allApps) {
      if (app.project_id !== projectId && userIds.includes(app.user_id)) {
        const existing = userCrossProjectDetail.get(app.user_id) ?? [];
        const proj = applyNowProjects?.find((p) => p.id === app.project_id);
        existing.push({
          projectId: app.project_id,
          clientName: proj?.clients?.name ?? "Other Project",
        });
        userCrossProjectDetail.set(app.user_id, existing);
      }
    }

    return {
      totalApplicants,
      hatCounts,
      uniqueApplicants,
      sharedApplicants,
      uniqueRatio,
      prevPhaseApplicants,
      prevPhaseRatio,
      readinessScore,
      userCrossProjectDetail,
    };
  }, [completedApps, allApps, project, projectId, userIds, applyNowProjects]);

  /* ── AG Grid columns ────────────────────────────── */
  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    for (const p of profiles ?? []) m.set(p.user_id, p);
    return m;
  }, [profiles]);

  const enrichedRows = useMemo(() => {
    if (!completedApps) return [];
    return completedApps.map((app) => ({
      ...app,
      profile: profileMap.get(app.user_id),
      otherProjects: analysis?.userCrossProjectDetail.get(app.user_id) ?? [],
    }));
  }, [completedApps, profileMap, analysis]);

  type EnrichedRow = (typeof enrichedRows)[number];

  const colDefs: ColDef<EnrichedRow>[] = useMemo(() => [
    {
      headerName: "Applicant",
      valueGetter: (p) => p.data?.profile?.display_name || `${p.data?.profile?.first_name ?? ""} ${p.data?.profile?.last_name ?? ""}`.trim() || p.data?.profile?.email || "Unknown",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      headerName: "Email",
      valueGetter: (p) => p.data?.profile?.email ?? "",
      flex: 1.5,
      minWidth: 180,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      headerName: "Team Hats",
      valueGetter: (p) => (p.data?.team_hats_interest ?? []).join(", "),
      flex: 2,
      minWidth: 200,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: "Previous Phase",
      valueGetter: (p) => p.data?.participated_previous_phase ? "Yes" : "No",
      width: 130,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      headerName: "Other Projects Applied",
      valueGetter: (p) => {
        const others = p.data?.otherProjects ?? [];
        if (others.length === 0) return "None (unique)";
        return others.map((o) => o.clientName).join(", ");
      },
      flex: 1.5,
      minWidth: 180,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: "Submitted",
      valueGetter: (p) => p.data?.completed_at ?? p.data?.created_at,
      valueFormatter: (p) => {
        try { return new Date(p.value).toLocaleDateString(); } catch { return "—"; }
      },
      width: 120,
      sort: "desc",
    },
  ], []);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    gridApiRef.current = e.api;
    e.api.sizeColumnsToFit();
  }, []);

  /* ── loading / auth guards ──────────────────────── */
  if (adminLoading || projLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground font-medium">Only administrators can access this page.</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container-app py-8">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const isPhase1 = project.phase === "phase_1";

  /* ── hat breakdown helpers ──────────────────────── */
  const foundationalHats = project.team_hats.filter((h) => FOUNDATIONAL_HATS.includes(h));
  const otherHats = project.team_hats.filter((h) => !FOUNDATIONAL_HATS.includes(h));

  function HatRow({ hat, count }: { hat: string; count: number }) {
    const isFoundational = FOUNDATIONAL_HATS.includes(hat);
    let statusIcon: React.ReactNode;
    let statusColor: string;
    if (count >= IDEAL_PER_HAT) {
      statusIcon = <CheckCircle2 className="h-4 w-4" />;
      statusColor = "text-success";
    } else if (count >= MIN_PER_HAT) {
      statusIcon = <AlertTriangle className="h-4 w-4" />;
      statusColor = "text-warning";
    } else if (count >= 1) {
      statusIcon = <AlertTriangle className="h-4 w-4" />;
      statusColor = "text-orange-500";
    } else {
      statusIcon = <XCircle className="h-4 w-4" />;
      statusColor = "text-destructive";
    }

    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
        <div className="flex items-center gap-2">
          <span className={statusColor}>{statusIcon}</span>
          <span className="text-sm font-medium text-foreground">{hat}</span>
          {isFoundational && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Foundational</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{count}</span>
          <span className="text-xs text-muted-foreground">/ {IDEAL_PER_HAT} ideal</span>
        </div>
      </div>
    );
  }

  const score = analysis?.readinessScore ?? 0;
  let scoreColor = "text-destructive";
  let scoreBg = "bg-destructive/10";
  if (score >= 75) { scoreColor = "text-success"; scoreBg = "bg-success/10"; }
  else if (score >= 50) { scoreColor = "text-warning"; scoreBg = "bg-warning/10"; }
  else if (score >= 25) { scoreColor = "text-orange-500"; scoreBg = "bg-orange-500/10"; }

  return (
    <div className="container-app py-8 sm:py-12 space-y-8">
      {/* ── Readiness Score ──────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recruitment Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${scoreColor}`}>{score}%</div>
            <Progress value={score} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Based on hat coverage (50%), other roles (20%), unique applicants (15%), and previous phase participation (15%).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Applicant Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Applicants</span>
              <span className="text-sm font-semibold">{analysis?.totalApplicants ?? 0}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Unique (this project only)</span>
              <span className="text-sm font-semibold text-success">{analysis?.uniqueApplicants ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Also applied elsewhere</span>
              <span className="text-sm font-semibold text-warning">{analysis?.sharedApplicants ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Previous Phase Participation</CardTitle>
          </CardHeader>
          <CardContent>
            {isPhase1 ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span className="text-sm">Not applicable — this is a Phase 1 project with no prior phase.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Participated in previous phase</span>
                  <span className="text-sm font-semibold">{analysis?.prevPhaseApplicants ?? 0} of {analysis?.totalApplicants ?? 0}</span>
                </div>
                <Progress value={(analysis?.prevPhaseRatio ?? 0) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Applicants with prior phase experience bring continuity and reduce ramp-up time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Hat Coverage ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Foundational Hat Coverage
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            These roles are essential for project success. Ideal: {IDEAL_PER_HAT} applicants per hat. Minimum: {MIN_PER_HAT}.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {foundationalHats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No foundational hats configured for this project.</p>
          ) : (
            foundationalHats.map((hat) => (
              <HatRow key={hat} hat={hat} count={analysis?.hatCounts.get(hat) ?? 0} />
            ))
          )}
        </CardContent>
      </Card>

      {otherHats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Other Role Coverage
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Important but not foundational. Still valuable for recruiting decisions.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {otherHats.map((hat) => (
              <HatRow key={hat} hat={hat} count={analysis?.hatCounts.get(hat) ?? 0} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Applicants Table ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>All Applicants</CardTitle>
          <p className="text-sm text-muted-foreground">
            {enrichedRows.length} completed {enrichedRows.length === 1 ? "application" : "applications"} for this project
          </p>
        </CardHeader>
        <CardContent>
          <div className="ag-theme-alpine" style={{ width: "100%", height: Math.min(600, 56 + enrichedRows.length * 48) }}>
            <ThemedAgGrid<EnrichedRow>
              rowData={enrichedRows}
              columnDefs={colDefs}
              onGridReady={onGridReady}
              domLayout="normal"
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
