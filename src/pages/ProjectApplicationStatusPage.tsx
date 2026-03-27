import { useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Clock, Calendar, UserCheck,
  XCircle, Users, LogOut, Loader2, FolderKanban, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES } from "@/data/project-constants";

/* ── status display config ─────────────────────────────────── */

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: typeof Clock;
  variant: "default" | "success" | "warning" | "destructive" | "info";
  description: string;
}> = {
  pending_review: {
    label: "Pending Review",
    icon: Clock,
    variant: "warning",
    description: "Your application is being reviewed by the project coordinator. You'll be notified when there's an update.",
  },
  invited_to_interview: {
    label: "Invited to Interview",
    icon: Calendar,
    variant: "info",
    description: "You've been invited to an interview! Please schedule your interview using the link provided in your notification, then accept this invitation below to confirm.",
  },
  interview_accepted: {
    label: "Interview Accepted",
    icon: CheckCircle2,
    variant: "success",
    description: "You've accepted the interview invitation. The project coordinator will follow up with you shortly.",
  },
  picked_for_team: {
    label: "Picked for Team",
    icon: UserCheck,
    variant: "success",
    description: "Congratulations! You've been selected to join the project team. Check your notifications for next steps.",
  },
  not_selected: {
    label: "Not Selected",
    icon: XCircle,
    variant: "destructive",
    description: "Unfortunately, you were not selected for this project at this time. We encourage you to apply to other project openings.",
  },
  active_participant: {
    label: "Active Participant",
    icon: Users,
    variant: "success",
    description: "You're an active participant on this project. Keep up the great work!",
  },
  left_the_project: {
    label: "Left the Project",
    icon: LogOut,
    variant: "default",
    description: "You are no longer active on this project.",
  },
};

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

function getStatusBadgeClasses(variant: string): string {
  switch (variant) {
    case "success": return "bg-success/10 text-success border-success/30";
    case "warning": return "bg-warning/10 text-warning border-warning/30";
    case "destructive": return "bg-destructive/10 text-destructive border-destructive/30";
    case "info": return "bg-primary/10 text-primary border-primary/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

/* ── component ────────────────────────────────────────────── */

export default function ProjectApplicationStatusPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ── fetch application ──────────────────────────────────── */
  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ["my-project-app-status", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("*")
        .eq("id", applicationId!)
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!applicationId && !!user,
  });

  /* ── fetch project ──────────────────────────────────────── */
  const { data: project } = useQuery({
    queryKey: ["project-for-app-status", app?.project_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_type, phase, project_status, team_hats, client_id")
        .eq("id", app!.project_id as string)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!app?.project_id,
  });

  /* ── fetch client ───────────────────────────────────────── */
  const { data: client } = useQuery({
    queryKey: ["client-for-app-status", project?.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, website, mission")
        .eq("id", project!.client_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!project?.client_id,
  });

  const applicantStatus = (app?.applicant_status as string) ?? "pending_review";
  const config = STATUS_CONFIG[applicantStatus] ?? STATUS_CONFIG.pending_review;
  const StatusIcon = config.icon;
  const clientName = client?.name ?? "Project";

  /* ── accept invitation mutation ─────────────────────────── */
  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("project_applications")
        .update({ applicant_status: "interview_accepted" })
        .eq("id", applicationId!)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Interview invitation accepted!", {
        description: "The project coordinator has been notified.",
        position: "top-center",
      });
      queryClient.invalidateQueries({ queryKey: ["my-project-app-status", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["my-project-applications"] });
      queryClient.invalidateQueries({ queryKey: ["my-project-apps-count"] });
    },
    onError: (err: Error) => {
      toast.error("Failed to accept invitation", { description: err.message });
    },
  });

  const handleAccept = useCallback(() => {
    acceptMutation.mutate();
  }, [acceptMutation]);

  /* ── loading / not found states ─────────────────────────── */
  if (appLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading application status" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="container-app py-12 text-center">
        <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-40 text-muted-foreground" />
        <p className="text-muted-foreground">Application not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/applications/projects")}>
          Back to Project Applications
        </Button>
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/applications">Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/applications/projects">Project Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Application Status</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/applications/projects")} aria-label="Back to Project Applications">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{clientName}</h1>
          <p className="text-sm text-muted-foreground">Application Status</p>
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <StatusIcon className="h-5 w-5 text-primary" />
            Application Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status badge */}
          <div className="flex flex-col items-center gap-4 py-6">
            <div className={`h-16 w-16 rounded-full flex items-center justify-center ${getStatusBadgeClasses(config.variant)}`}>
              <StatusIcon className="h-8 w-8" />
            </div>
            <Badge className={`text-sm px-4 py-1.5 gap-1.5 ${getStatusBadgeClasses(config.variant)}`}>
              {config.label}
            </Badge>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {config.description}
            </p>
          </div>

          {/* Accept Invitation CTA */}
          {applicantStatus === "invited_to_interview" && (
            <div className="border border-primary/20 bg-primary/5 rounded-lg p-6 text-center space-y-4">
              <PartyPopper className="h-8 w-8 text-primary mx-auto" />
              <h3 className="text-lg font-semibold text-foreground">
                You've been invited to interview!
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Please schedule your interview using the scheduling link in your notification email, 
                then click the button below to confirm your acceptance.
              </p>
              <Button
                size="lg"
                className="gap-2"
                onClick={handleAccept}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Accept Interview Invitation
              </Button>
            </div>
          )}

          {applicantStatus === "interview_accepted" && (
            <div className="border border-success/20 bg-success/5 rounded-lg p-6 text-center space-y-3">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
              <h3 className="text-lg font-semibold text-foreground">
                Interview Invitation Accepted
              </h3>
              <p className="text-sm text-muted-foreground">
                You've confirmed your interview. The coordinator will reach out with further details.
              </p>
            </div>
          )}

          <Separator />

          {/* Submission details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Submission Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {app.completed_at && (
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium text-foreground">
                    {format(new Date(app.completed_at as string), "MMM d, yyyy")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Team Hats</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {((app.team_hats_interest as string[]) ?? []).map((h) => (
                    <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Project details */}
          {project && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Project Details</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">{typeLabel(project.project_type)}</Badge>
                  <Badge variant="outline" className="text-xs">{phaseLabel(project.phase)}</Badge>
                  <Badge variant="outline" className="text-xs">{statusLabel(project.project_status)}</Badge>
                </div>
                {client?.mission && (
                  <p className="text-sm text-muted-foreground">{client.mission}</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bottom nav */}
      <div className="flex justify-between pb-8">
        <Button variant="outline" onClick={() => navigate("/applications/projects")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to Project Applications
        </Button>
      </div>
    </div>
  );
}
