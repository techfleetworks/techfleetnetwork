import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Loader2, ShieldAlert, CheckCircle2, AlertTriangle, XCircle,
  Users, Target, Info, HelpCircle, ExternalLink,
} from "lucide-react";
import { PROJECT_TYPES, PROJECT_PHASES } from "@/data/project-constants";
import type { ColDef } from "ag-grid-community";

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

interface HatBreakdown {
  unique: number;
  shared: number;
  total: number;
}

/* ── scoring logic ─────────────────────────────────── */
function computeReadinessScore(
  hatBreakdowns: Map<string, HatBreakdown>,
  projectHats: string[],
  uniqueRatio: number,
  prevPhaseRatio: number,
  phase: string,
): { score: number; details: ScoreDetails } {
  // 50% weight: foundational hat coverage (based on UNIQUE applicants)
  const foundationalPresent = FOUNDATIONAL_HATS.filter((h) => projectHats.includes(h));
  let hatScore = 0;
  const hatDetails: { hat: string; uniqueCount: number; subScore: number }[] = [];
  if (foundationalPresent.length > 0) {
    const perHatScores = foundationalPresent.map((h) => {
      const bd = hatBreakdowns.get(h);
      const uniqueCount = bd?.unique ?? 0;
      let subScore = 0;
      if (uniqueCount >= IDEAL_PER_HAT) subScore = 1;
      else if (uniqueCount >= MIN_PER_HAT) subScore = 0.6;
      else if (uniqueCount >= 1) subScore = 0.3;
      hatDetails.push({ hat: h, uniqueCount, subScore });
      return subScore;
    });
    hatScore = perHatScores.reduce((s, v) => s + v, 0) / foundationalPresent.length;
  }

  // 20% weight: other hats coverage (unique)
  const otherHats = projectHats.filter((h) => !FOUNDATIONAL_HATS.includes(h));
  let otherScore = 1;
  if (otherHats.length > 0) {
    const filled = otherHats.filter((h) => (hatBreakdowns.get(h)?.unique ?? 0) >= 1).length;
    otherScore = filled / otherHats.length;
  }

  // 15% weight: unique applicant ratio
  const uniqueScore = uniqueRatio;

  // 15% weight: previous phase participation
  const prevScore = phase === "phase_1" ? 1 : prevPhaseRatio;

  const score = Math.round((hatScore * 0.5 + otherScore * 0.2 + uniqueScore * 0.15 + prevScore * 0.15) * 100);

  return {
    score,
    details: {
      hatScore: Math.round(hatScore * 100),
      hatDetails,
      otherScore: Math.round(otherScore * 100),
      otherHatsCount: otherHats.length,
      otherHatsFilled: otherHats.filter((h) => (hatBreakdowns.get(h)?.unique ?? 0) >= 1).length,
      uniqueScore: Math.round(uniqueRatio * 100),
      prevScore: Math.round((phase === "phase_1" ? 1 : prevPhaseRatio) * 100),
      isPhase1: phase === "phase_1",
    },
  };
}

interface ScoreDetails {
  hatScore: number;
  hatDetails: { hat: string; uniqueCount: number; subScore: number }[];
  otherScore: number;
  otherHatsCount: number;
  otherHatsFilled: number;
  uniqueScore: number;
  prevScore: number;
  isPhase1: boolean;
}

/* ── component ─────────────────────────────────────── */
export default function ProjectAnalysisDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { setHeader } = usePageHeader();
  const gridApiRef = useRef<GridApi | null>(null);
  const [multiProjectSheet, setMultiProjectSheet] = useState<{ hat: string } | null>(null);

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

    // Determine which users are unique (only applied to this project)
    const userOtherProjects = new Map<string, string[]>();
    for (const app of allApps) {
      if (app.project_id !== projectId) {
        const existing = userOtherProjects.get(app.user_id) ?? [];
        existing.push(app.project_id);
        userOtherProjects.set(app.user_id, existing);
      }
    }
    const uniqueUserIds = new Set(completedApps.filter((a) => !userOtherProjects.has(a.user_id)).map((a) => a.user_id));

    const uniqueApplicants = uniqueUserIds.size;
    const sharedApplicants = totalApplicants - uniqueApplicants;
    const uniqueRatio = totalApplicants > 0 ? uniqueApplicants / totalApplicants : 0;

    // Hat breakdown: unique vs shared
    const hatBreakdowns = new Map<string, HatBreakdown>();
    for (const app of completedApps) {
      const isUnique = uniqueUserIds.has(app.user_id);
      for (const hat of app.team_hats_interest) {
        const prev = hatBreakdowns.get(hat) ?? { unique: 0, shared: 0, total: 0 };
        prev.total += 1;
        if (isUnique) prev.unique += 1;
        else prev.shared += 1;
        hatBreakdowns.set(hat, prev);
      }
    }

    // Previous phase participation
    const prevPhaseApplicants = completedApps.filter((a) => a.participated_previous_phase).length;
    const prevPhaseRatio = totalApplicants > 0 ? prevPhaseApplicants / totalApplicants : 0;

    // Readiness score based on unique applicants per hat
    const { score: readinessScore, details: scoreDetails } = computeReadinessScore(
      hatBreakdowns, project.team_hats, uniqueRatio, prevPhaseRatio, project.phase,
    );

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
      hatBreakdowns,
      uniqueApplicants,
      sharedApplicants,
      uniqueRatio,
      uniqueUserIds,
      prevPhaseApplicants,
      prevPhaseRatio,
      readinessScore,
      scoreDetails,
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
      isUnique: analysis?.uniqueUserIds.has(app.user_id) ?? false,
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
      headerName: "Unique",
      valueGetter: (p) => p.data?.isUnique ? "Yes" : "No",
      width: 100,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellStyle: (p) => ({ color: p.value === "Yes" ? "hsl(var(--success))" : "hsl(var(--warning))" }),
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

  function HatRow({ hat }: { hat: string }) {
    const isFoundational = FOUNDATIONAL_HATS.includes(hat);
    const bd = analysis?.hatBreakdowns.get(hat) ?? { unique: 0, shared: 0, total: 0 };
    let statusIcon: React.ReactNode;
    let statusColor: string;
    // Readiness based on UNIQUE count
    if (bd.unique >= IDEAL_PER_HAT) {
      statusIcon = <CheckCircle2 className="h-4 w-4" />;
      statusColor = "text-success";
    } else if (bd.unique >= MIN_PER_HAT) {
      statusIcon = <AlertTriangle className="h-4 w-4" />;
      statusColor = "text-warning";
    } else if (bd.unique >= 1) {
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" title="Applicants who selected this hat and ONLY applied to this project">
            <span className="text-sm font-semibold text-success">{bd.unique}</span>
            <span className="text-xs text-muted-foreground">exclusive</span>
          </div>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            className="flex items-center gap-1.5 hover:underline underline-offset-2 focus-visible:outline-2 outline-ring rounded-sm disabled:opacity-50 disabled:cursor-default"
            title="Click to view multi-project applicants for this hat"
            disabled={bd.shared === 0}
            onClick={() => bd.shared > 0 && setMultiProjectSheet({ hat })}
          >
            <span className="text-sm font-semibold text-warning">{bd.shared}</span>
            <span className="text-xs text-muted-foreground">multi-project</span>
          </button>
          <span className="text-muted-foreground/40">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">{bd.total}</span>
            <span className="text-xs text-muted-foreground">total</span>
          </div>
          <span className="text-xs text-muted-foreground ml-1">/ {IDEAL_PER_HAT} ideal</span>
        </div>
      </div>
    );
  }

  const score = analysis?.readinessScore ?? 0;
  let scoreColor = "text-destructive";
  if (score >= 75) { scoreColor = "text-success"; }
  else if (score >= 50) { scoreColor = "text-warning"; }
  else if (score >= 25) { scoreColor = "text-orange-500"; }

  const details = analysis?.scoreDetails;

  return (
    <div className="container-app py-8 sm:py-12 space-y-8">
      {/* ── Readiness Score ──────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Recruitment Readiness
              <ScoreBreakdownDialog score={score} details={details} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${scoreColor}`}>{score}%</div>
            <Progress value={score} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Based on <strong>exclusive</strong> applicants per foundational hat — people who selected the hat <em>and</em> only applied to this project (50%), other roles (20%), exclusive applicant ratio (15%), and previous phase participation (15%).
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
              <span className="text-sm text-muted-foreground">Exclusive (this project only)</span>
              <span className="text-sm font-semibold text-success">{analysis?.uniqueApplicants ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Multi-project (also applied elsewhere)</span>
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
            Readiness is based on <strong>exclusive applicants</strong> — people who selected this hat and did <em>not</em> apply to any other project.
            Ideal: {IDEAL_PER_HAT} exclusive per hat. Minimum: {MIN_PER_HAT}. Multi-project applicants are shown but don't count toward readiness.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {foundationalHats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No foundational hats configured for this project.</p>
          ) : (
            foundationalHats.map((hat) => <HatRow key={hat} hat={hat} />)
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
            {otherHats.map((hat) => <HatRow key={hat} hat={hat} />)}
          </CardContent>
        </Card>
      )}

      {/* ── Applicants Table ─────────────────────── */}
      <ApplicantsTable rows={enrichedRows} />
      {/* ── Multi-project applicants side panel ── */}
      <Sheet open={!!multiProjectSheet} onOpenChange={(open) => !open && setMultiProjectSheet(null)}>
        <SheetContent className="w-full sm:max-w-lg" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle className="break-words">
              Multi-project Applicants — {multiProjectSheet?.hat}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-6rem)] mt-4 pr-3">
            <div className="space-y-4">
              {(() => {
                if (!multiProjectSheet || !completedApps || !analysis) return null;
                const hat = multiProjectSheet.hat;
                // Find applicants who selected this hat AND are multi-project
                const sharedForHat = completedApps.filter(
                  (app) =>
                    app.team_hats_interest.includes(hat) &&
                    !analysis.uniqueUserIds.has(app.user_id),
                );
                if (sharedForHat.length === 0) {
                  return <p className="text-sm text-muted-foreground">No multi-project applicants for this hat.</p>;
                }
                return sharedForHat.map((app) => {
                  const profile = profileMap.get(app.user_id);
                  const name =
                    profile?.display_name ||
                    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
                    profile?.email ||
                    "Unknown";
                  const otherProjects = analysis.userCrossProjectDetail.get(app.user_id) ?? [];
                  return (
                    <div key={app.id} className="rounded-md border bg-card p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{name}</p>
                        {profile?.email && (
                          <p className="text-xs text-muted-foreground">{profile.email}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Hats applied for on this project
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {app.team_hats_interest.map((h) => (
                            <Badge
                              key={h}
                              variant={h === hat ? "default" : "outline"}
                              className="text-xs"
                            >
                              {h}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Also applied to
                        </p>
                        {otherProjects.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No other projects found</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {otherProjects.map((op) => (
                              <Badge key={op.projectId} variant="secondary" className="text-xs gap-1">
                                <ExternalLink className="h-3 w-3" />
                                {op.clientName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── Score Breakdown Dialog ───────────────────────── */
function ScoreBreakdownDialog({ score, details }: { score: number; details?: ScoreDetails }) {
  if (!details) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full" aria-label="How is this score calculated?">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recruitment Readiness Score — {score}%</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          {/* Foundational Hats — 50% */}
          <section className="space-y-2">
            <div className="flex justify-between font-medium">
              <span>Foundational Hat Coverage (50% weight)</span>
              <span className="text-primary">{details.hatScore}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Scored per foundational hat based on <strong>exclusive</strong> applicants (people who selected the hat and only applied to this project): ≥{IDEAL_PER_HAT} = 100%, ≥{MIN_PER_HAT} = 60%, ≥1 = 30%, 0 = 0%. Averaged across all foundational hats. Multi-project applicants are not counted.
            </p>
            <div className="space-y-1 pl-3 border-l-2 border-muted">
              {details.hatDetails.map((h) => (
                <div key={h.hat} className="flex justify-between text-xs">
                  <span>{h.hat} — {h.uniqueCount} unique</span>
                  <span className="text-muted-foreground">{Math.round(h.subScore * 100)}%</span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Other Roles — 20% */}
          <section className="space-y-1">
            <div className="flex justify-between font-medium">
              <span>Other Role Coverage (20% weight)</span>
              <span className="text-primary">{details.otherScore}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {details.otherHatsCount === 0
                ? "No other hats on this project — full marks."
                : `${details.otherHatsFilled} of ${details.otherHatsCount} other roles have at least 1 unique applicant.`}
            </p>
          </section>

          <Separator />

          {/* Unique Ratio — 15% */}
          <section className="space-y-1">
            <div className="flex justify-between font-medium">
              <span>Unique Applicant Ratio (15% weight)</span>
              <span className="text-primary">{details.uniqueScore}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Percentage of applicants who only applied to this project. Higher = less competition for recruiter attention.
            </p>
          </section>

          <Separator />

          {/* Previous Phase — 15% */}
          <section className="space-y-1">
            <div className="flex justify-between font-medium">
              <span>Previous Phase Participation (15% weight)</span>
              <span className="text-primary">{details.prevScore}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {details.isPhase1
                ? "Phase 1 project — automatically scored at 100% (no previous phase exists)."
                : "Percentage of applicants who participated in the previous phase of this project."}
            </p>
          </section>

          <Separator />

          <div className="flex justify-between font-semibold text-base">
            <span>Final Score</span>
            <span className="text-primary">
              ({details.hatScore}% × 0.5) + ({details.otherScore}% × 0.2) + ({details.uniqueScore}% × 0.15) + ({details.prevScore}% × 0.15) = {score}%
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
