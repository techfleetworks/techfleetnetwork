import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, FolderKanban, HeartHandshake, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GeneralApplicationService } from "@/services/general-application.service";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { lazy, Suspense } from "react";

const SubmittedApplicationsTab = lazy(() =>
  import("@/components/SubmittedApplicationsTab").then((m) => ({
    default: m.default,
  }))
);

export default function ApplicationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [appStatus, setAppStatus] = useState<{ completed: boolean; completedAt: string | null }>({ completed: false, completedAt: null });

  useEffect(() => {
    if (!user) return;
    GeneralApplicationService.list(user.id).then((apps) => {
      if (apps.length > 0 && apps[0].status === "completed") {
        setAppStatus({ completed: true, completedAt: ((apps[0] as unknown as Record<string, unknown>).completed_at as string | null) ?? apps[0].updated_at });
      }
    }).catch(() => {});
  }, [user]);

  /* Count user's own project applications for the card badge */
  const { data: myProjectApps } = useQuery({
    queryKey: ["my-project-apps-count", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("id, status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const projAppCount = myProjectApps?.length ?? 0;
  const projAppsCompleted = myProjectApps?.filter((a) => a.status === "completed").length ?? 0;
  const projAppsDraft = myProjectApps?.filter((a) => a.status === "draft").length ?? 0;

  const yourApplicationsContent = (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* General Application Card */}
      <Link
        to="/applications/general"
        className="group rounded-lg border bg-card p-6 hover:shadow-md transition-shadow duration-200 flex flex-col relative"
      >
        {appStatus.completed && (
          <Badge className="absolute top-4 right-4 bg-success/10 text-success border-success/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        )}
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          My General Application
        </h2>
        <p className="text-sm text-muted-foreground flex-1">
          Submit your general application to join the Tech Fleet community.
          Covers your background, agile mindset, and service leadership.
        </p>
        {appStatus.completed && appStatus.completedAt && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-success/10 border border-success/20 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span className="text-sm font-medium text-success">
              Completed on {format(new Date(appStatus.completedAt), "MMM d, yyyy")}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 mt-4 text-sm font-medium text-primary group-hover:gap-2 transition-all">
          {appStatus.completed ? "View & Edit" : "Open"}
          <ArrowRight className="h-4 w-4" />
        </div>
      </Link>

      {/* Project Applications Card */}
      <Link
        to="/applications/projects"
        className="group rounded-lg border bg-card p-6 hover:shadow-md transition-shadow duration-200 flex flex-col relative"
      >
        {projAppsCompleted > 0 && (
          <Badge className="absolute top-4 right-4 bg-success/10 text-success border-success/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {projAppsCompleted} Submitted
          </Badge>
        )}
        {projAppsCompleted === 0 && projAppsDraft > 0 && (
          <Badge className="absolute top-4 right-4 bg-warning/10 text-warning border-warning/30 gap-1">
            {projAppsDraft} In Progress
          </Badge>
        )}
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <FolderKanban className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          My Project Applications
        </h2>
        <p className="text-sm text-muted-foreground flex-1">
          View your project team applications. Each project has its own
          application requirements and timeline.
        </p>
        <div className="flex items-center gap-1 mt-4 text-sm font-medium text-primary group-hover:gap-2 transition-all">
          {projAppCount > 0 ? "View Applications" : "Browse Openings"}
          <ArrowRight className="h-4 w-4" />
        </div>
      </Link>

      {/* Volunteer Applications Card */}
      <div className="rounded-lg border bg-card p-6 flex flex-col">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <HeartHandshake className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Volunteer Applications
        </h2>
        <p className="text-sm text-muted-foreground flex-1">
          Apply to volunteer teams that support Tech Fleet operations,
          mentorship, and community initiatives.
        </p>
        <span className="mt-4 text-sm text-muted-foreground italic">Coming soon</span>
      </div>
    </div>
  );

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Applications
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your applications and track your progress.
        </p>
      </div>

      <Tabs defaultValue="yours">
        <TabsList>
          <TabsTrigger value="yours">Your Applications</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="all">All Applications</TabsTrigger>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger value="all" disabled className="gap-1.5 opacity-50 cursor-not-allowed">
                    <Lock className="h-3.5 w-3.5" />
                    All Applications
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Only available for administrators</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TabsList>
        <TabsContent value="yours" className="mt-6">
          {yourApplicationsContent}
        </TabsContent>
        {isAdmin && (
          <TabsContent value="all" className="mt-6">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
              <SubmittedApplicationsTab />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
