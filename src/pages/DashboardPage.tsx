import { memo, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FolderKanban,
  Heart,
  Lock,
  Megaphone,
  MessageSquare,
  PartyPopper,
  Users,
  CheckCircle2,
} from "lucide-react";
import celebrationImg from "@/assets/courses-complete-celebration.png";
import { Badge } from "@/components/ui/badge";
import { ApplicationStatusBadge } from "@/components/ApplicationStatusBadge";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { DashboardCustomizer } from "@/components/DashboardCustomizer";
import { DiscordInviteBanner } from "@/components/DiscordInviteBanner";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { SectionEmptyState } from "@/components/SectionEmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCompletedCount } from "@/hooks/use-journey-progress";
import { TOTAL_FIRST_STEPS, FIRST_STEPS_TASK_IDS } from "@/pages/FirstStepsPage";
import { TOTAL_CONNECT_DISCORD, CONNECT_DISCORD_TASK_IDS } from "@/pages/ConnectDiscordPage";
import { useLatestAnnouncements } from "@/hooks/use-announcements";
import { useDashboardPreferences } from "@/hooks/use-dashboard-preferences";
import { StatsService } from "@/services/stats.service";
import { stripHtml } from "@/lib/html";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_DISCORD_LESSONS } from "@/data/discord-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { TOTAL_PROJECT_TRAINING_LESSONS } from "@/data/project-training-course";
import { TOTAL_VOLUNTEER_LESSONS } from "@/data/volunteer-teams-course";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@/lib/react-query";

// Lazy-load heavy components
const NetworkActivity = lazy(() =>
  import("@/components/NetworkActivity").then((m) => ({ default: m.NetworkActivity }))
);

interface CoreCourse {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  totalTasks: number;
  completedTasks: number;
  locked: boolean;
  prerequisiteLabel?: string;
}

const CoreCourseCard = memo(function CoreCourseCard({ course }: { course: CoreCourse }) {
  const progress = course.totalTasks > 0
    ? Math.round((course.completedTasks / course.totalTasks) * 100)
    : 0;
  const isComplete = course.totalTasks > 0 && course.completedTasks >= course.totalTasks;
  const isStarted = course.completedTasks > 0;
  const Icon = course.icon;

  if (course.locked) {
    return (
      <div
        className="card-elevated p-4 opacity-50 cursor-not-allowed relative overflow-hidden"
        aria-label={`${course.title} — Locked. Complete ${course.prerequisiteLabel} first.`}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-muted-foreground truncate">{course.title}</h3>
            <p className="text-xs text-muted-foreground/70 truncate">{course.description}</p>
          </div>
          <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/20 text-xs gap-1 flex-shrink-0">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={course.href}
      className="card-elevated p-4 hover:border-primary/40 transition-all group block"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
              {course.title}
            </h3>
            {isComplete ? (
              <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0">
                Complete
              </Badge>
            ) : isStarted ? (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs flex-shrink-0">
                In Progress
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs flex-shrink-0">Not Started</Badge>
            )}
          </div>
          {course.totalTasks > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden flex-1">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {course.completedTasks}/{course.totalTasks}
              </span>
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
});

function DashboardSkeleton() {
  return (
    <div className="container-app py-8 sm:py-12 space-y-9">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const customizerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const { visibleWidgets, widgetOrder, isVisible, toggleWidget, reorderWidgets, isNewUser, isLoading: prefsLoading } = useDashboardPreferences();

  const totalFirstSteps = TOTAL_FIRST_STEPS;

  // Batch all journey progress queries — React Query deduplicates automatically
  const { data: connectDiscordCompleted = 0 } = useCompletedCount(userId, "first_steps", CONNECT_DISCORD_TASK_IDS);
  const { data: firstStepsCompleted = 0 } = useCompletedCount(userId, "first_steps", FIRST_STEPS_TASK_IDS);
  const { data: secondStepsCompleted = 0 } = useCompletedCount(userId, "second_steps");
  const { data: discordCompleted = 0 } = useCompletedCount(userId, "discord_learning");
  const { data: thirdStepsCompleted = 0 } = useCompletedCount(userId, "third_steps");
  const { data: projectTrainingCompleted = 0 } = useCompletedCount(userId, "project_training");
  const { data: volunteerCompleted = 0 } = useCompletedCount(userId, "volunteer");
  const { data: latestAnnouncements = [] } = useLatestAnnouncements(5);

  // Share cache key with NetworkActivity component — no duplicate fetch
  const { data: stats } = useQuery({
    queryKey: ["network-stats"],
    queryFn: () => StatsService.getNetworkStats(),
    staleTime: 10 * 60 * 1000,
  });

  // Fetch general application status
  const { data: generalApp } = useQuery({
    queryKey: ["dashboard-general-app", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("id, status, completed_at, updated_at, current_section")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Combine project apps + projects + clients into a single query to avoid waterfall
  const { data: projectAppData } = useQuery({
    queryKey: ["dashboard-project-apps-combined", userId],
    queryFn: async () => {
      const { data: apps, error: appsErr } = await supabase
        .from("project_applications")
        .select("id, project_id, status, applicant_status, completed_at, updated_at, current_step, team_hats_interest")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false });
      if (appsErr) throw appsErr;
      if (!apps || apps.length === 0) return { apps: [], projects: [], clients: [] };

      const projectIds = [...new Set(apps.map((a) => a.project_id))];
      const { data: projects } = await supabase
        .from("projects").select("id, client_id, project_type, phase, project_status").in("id", projectIds);

      const clientIds = [...new Set((projects ?? []).map((p) => p.client_id))];
      const { data: clients } = clientIds.length > 0
        ? await supabase.from("clients").select("id, name").in("id", clientIds)
        : { data: [] };

      return { apps: apps ?? [], projects: projects ?? [], clients: clients ?? [] };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Realtime: invalidate project apps cache when applicant_status changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("dashboard-project-apps-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "project_applications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-project-apps-combined", userId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  const myProjectApps = projectAppData?.apps ?? [];
  const dashProjectMap = useMemo(() => new Map((projectAppData?.projects ?? []).map((p) => [p.id, p])), [projectAppData?.projects]);
  const dashClientMap = useMemo(() => new Map((projectAppData?.clients ?? []).map((c) => [c.id, c])), [projectAppData?.clients]);

  const communityBadgeCount = stats?.badges_earned ?? null;

  const allConnectDiscordDone = connectDiscordCompleted >= TOTAL_CONNECT_DISCORD;
  const allFirstStepsDone = totalFirstSteps > 0 && firstStepsCompleted >= totalFirstSteps;
  const allSecondStepsDone = secondStepsCompleted >= TOTAL_AGILE_LESSONS;
  const allDiscordDone = discordCompleted >= TOTAL_DISCORD_LESSONS;
  const allThirdStepsDone = thirdStepsCompleted >= TOTAL_TEAMWORK_LESSONS;
  const allProjectTrainingDone = projectTrainingCompleted >= TOTAL_PROJECT_TRAINING_LESSONS;
  const allVolunteerDone = volunteerCompleted >= TOTAL_VOLUNTEER_LESSONS;
  const allCoreCoursesDone = allConnectDiscordDone && allFirstStepsDone && allSecondStepsDone && allDiscordDone && allThirdStepsDone && allProjectTrainingDone && allVolunteerDone;

  const coreCourses: CoreCourse[] = useMemo(() => [
    {
      id: "connect-discord",
      title: "Connect to Discord",
      description: "Link your Discord account to the Tech Fleet Network platform.",
      icon: MessageSquare,
      href: "/courses/connect-discord",
      totalTasks: TOTAL_CONNECT_DISCORD,
      completedTasks: connectDiscordCompleted,
      locked: false,
    },
    {
      id: "onboarding",
      title: "Onboarding Steps",
      description: "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.",
      icon: ClipboardCheck,
      href: "/courses/onboarding",
      totalTasks: totalFirstSteps,
      completedTasks: firstStepsCompleted,
      locked: false,
    },
    {
      id: "agile-mindset",
      title: "Build an Agile Mindset",
      description: `${TOTAL_AGILE_LESSONS} lessons covering agile philosophies, teamwork, and scrum methods.`,
      icon: BookOpen,
      href: "/courses/agile-mindset",
      totalTasks: TOTAL_AGILE_LESSONS,
      completedTasks: secondStepsCompleted,
      locked: false,
    },
    {
      id: "discord-learning",
      title: "Discord Learning Series",
      description: `${TOTAL_DISCORD_LESSONS} lessons on getting started and interacting in Tech Fleet Discord.`,
      icon: Users,
      href: "/courses/discord-learning",
      totalTasks: TOTAL_DISCORD_LESSONS,
      completedTasks: discordCompleted,
      locked: false,
    },
    {
      id: "agile-teamwork",
      title: "Agile Cross-Functional Team Dynamics",
      description: `${TOTAL_TEAMWORK_LESSONS} lessons from the Teammate Handbook.`,
      icon: Users,
      href: "/courses/agile-teamwork",
      totalTasks: TOTAL_TEAMWORK_LESSONS,
      completedTasks: thirdStepsCompleted,
      locked: false,
    },
    {
      id: "project-training",
      title: "Join Project Training Teams",
      description: `${TOTAL_PROJECT_TRAINING_LESSONS} lessons on apprenticeship training and nonprofit clients.`,
      icon: Briefcase,
      href: "/courses/project-training",
      totalTasks: TOTAL_PROJECT_TRAINING_LESSONS,
      completedTasks: projectTrainingCompleted,
      locked: !allThirdStepsDone,
      prerequisiteLabel: "Agile Cross-Functional Team Dynamics",
    },
    {
      id: "volunteer-teams",
      title: "Join Volunteer Teams",
      description: `${TOTAL_VOLUNTEER_LESSONS} lessons on volunteering at Tech Fleet.`,
      icon: Heart,
      href: "/courses/volunteer-teams",
      totalTasks: TOTAL_VOLUNTEER_LESSONS,
      completedTasks: volunteerCompleted,
      locked: !allThirdStepsDone,
      prerequisiteLabel: "Agile Cross-Functional Team Dynamics",
    },
  ], [connectDiscordCompleted, firstStepsCompleted, secondStepsCompleted, discordCompleted, thirdStepsCompleted, projectTrainingCompleted, volunteerCompleted, allThirdStepsDone, totalFirstSteps]);

  const displayName = profile?.first_name || profile?.display_name || user?.user_metadata?.full_name || "there";

  // Hook guarantees arrays — no runtime guards needed
  const togglableSectionsVisible = visibleWidgets.filter((w) => w !== "core_courses").length;
  const showEmptyState = !prefsLoading && isNewUser && togglableSectionsVisible === 0;

  const handleOpenCustomizer = () => {
    customizerRef.current?.click();
  };

  return (
    <div className="container-app py-8 sm:py-12 space-y-9">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">Welcome back, {displayName} 👋</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Continue your journey through the Tech Fleet training platform.</p>
        </div>
        <div className="flex-shrink-0">
          <DashboardCustomizer
            visibleWidgets={visibleWidgets}
            widgetOrder={widgetOrder}
            onToggle={toggleWidget}
            onReorder={reorderWidgets}
          />
        </div>
      </div>

      <DiscordInviteBanner />

      {widgetOrder.map((widgetId) => {
        switch (widgetId) {
          case "badges":
            return isVisible("badges") ? (
              <section key="badges">
                <BadgesDisplay
                  allFirstStepsDone={allFirstStepsDone}
                  allSecondStepsDone={allSecondStepsDone}
                  allDiscordDone={allDiscordDone}
                  allThirdStepsDone={allThirdStepsDone}
                  allProjectTrainingDone={allProjectTrainingDone}
                  allVolunteerDone={allVolunteerDone}
                  communityBadgeCount={communityBadgeCount}
                />
              </section>
            ) : null;

          case "core_courses":
            return isVisible("core_courses") ? (
              <section key="core_courses" aria-labelledby="core-courses-heading">
                <h2 id="core-courses-heading" className="text-xl font-semibold text-foreground mb-4">
                  Course Completion
                </h2>
                {allCoreCoursesDone ? (
                  <div className="card-elevated overflow-hidden">
                    <div className="flex flex-col sm:flex-row items-stretch">
                      <div className="sm:w-48 md:w-56 flex-shrink-0 bg-primary/5">
                        <img
                          src={celebrationImg}
                          alt="Celebration — all core courses completed"
                          className="w-full h-48 sm:h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex-1 p-6 flex flex-col justify-center space-y-3">
                        <div className="flex items-center gap-2 justify-center sm:justify-start">
                          <PartyPopper className="h-5 w-5 text-primary" aria-hidden="true" />
                          <h3 className="text-lg font-bold text-foreground">
                            You finished the onboarding and core courses!
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed text-center sm:text-left">
                          Congratulations, you are ready to keep going into deeper training in our community! Check out the basic and advanced courses to go further.
                        </p>
                        <div className="text-center sm:text-left">
                          <Link
                            to="/courses"
                            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            Continue Courses
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {coreCourses.map((course) => (
                      <CoreCourseCard key={course.id} course={course} />
                    ))}
                  </div>
                )}
              </section>
            ) : null;

          case "my_project_apps":
            return isVisible("my_project_apps") ? (
              <section key="my_project_apps" aria-labelledby="my-apps-heading">
                <div className="flex items-center justify-between mb-4">
                  <h2 id="my-apps-heading" className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <FolderKanban className="h-5 w-5 text-primary" />
                    My Applications
                  </h2>
                  <Link
                    to="/applications"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>

                {/* General Application card */}
                {generalApp ? (
                  <Link
                    to="/applications/general"
                    className="card-elevated p-4 hover:border-primary/40 transition-all block mb-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground truncate">
                            General Application
                          </h3>
                          {generalApp.status === "submitted" ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0 gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Submitted
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs flex-shrink-0 gap-1">
                              <Clock className="h-3 w-3" />
                              Draft
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {generalApp.status === "submitted" && generalApp.completed_at
                            ? `Submitted ${format(new Date(generalApp.completed_at), "MMM d, yyyy")}`
                            : `Section ${generalApp.current_section} of 5 · Updated ${format(new Date(generalApp.updated_at), "MMM d")}`}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ) : (
                  <Link
                    to="/applications/general"
                    className="card-elevated p-4 hover:border-primary/40 transition-all block mb-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate">General Application</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Required before applying to projects</p>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">Not Started</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                )}

                {myProjectApps.length === 0 ? (
                  <SectionEmptyState
                    icon={FolderKanban}
                    title="No project applications yet"
                    description="When project openings are available, you can apply and track your progress here."
                  />
                ) : (
                  <div className="space-y-2">
                    {myProjectApps.map((app) => {
                      const proj = dashProjectMap.get(app.project_id);
                      const clientName = proj ? (dashClientMap.get(proj.client_id)?.name ?? "Client") : "Client";
                      const isCompleted = app.status === "completed";
                      const isDraft = app.status === "draft";
                      const applicantStatus = (app as any).applicant_status as string | undefined;

                      // Route completed apps to status page, drafts to editor
                      const appHref = isCompleted
                        ? `/applications/projects/${app.id}/status`
                        : `/project-openings/${app.project_id}/apply`;

                      // Determine badge based on applicant_status from Recruiting Center
                      const getStatusBadge = () => {
                        if (isDraft) {
                          return (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs flex-shrink-0 gap-1">
                              <Clock className="h-3 w-3" />
                              In Progress
                            </Badge>
                          );
                        }
                        if (!isCompleted) return null;
                        switch (applicantStatus) {
                        case "invited_to_interview":
                        case "interview_scheduled":
                            return (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs flex-shrink-0 gap-1">
                                🎉 Interview
                              </Badge>
                            );
                          case "not_selected":
                            return (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs flex-shrink-0 gap-1">
                                Not Selected
                              </Badge>
                            );
                          case "picked_for_team":
                            return (
                              <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Selected for Team
                              </Badge>
                            );
                          case "active_participant":
                            return (
                              <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0 gap-1">
                                <Trophy className="h-3 w-3" />
                                Active Teammate
                              </Badge>
                            );
                          case "left_the_project":
                            return (
                              <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs flex-shrink-0 gap-1">
                                Left Project
                              </Badge>
                            );
                          default:
                            return (
                              <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Submitted
                              </Badge>
                            );
                        }
                      };

                      return (
                        <Link
                          key={app.id}
                          to={appHref}
                          className="card-elevated p-4 hover:border-primary/40 transition-all block"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <FolderKanban className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-sm text-foreground truncate">
                                  {clientName}
                                </h3>
                                {getStatusBadge()}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {isCompleted && app.completed_at
                                  ? `Submitted ${format(new Date(app.completed_at), "MMM d, yyyy")}`
                                  : isDraft
                                    ? `Step ${app.current_step} of 3 · Updated ${format(new Date(app.updated_at), "MMM d")}`
                                    : ""}
                                {app.team_hats_interest.length > 0 && ` · ${app.team_hats_interest.join(", ")}`}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null;

          case "latest_updates":
            return isVisible("latest_updates") ? (
              <section key="latest_updates" aria-labelledby="announcements-heading">
                <div className="flex items-center justify-between mb-4">
                  <h2 id="announcements-heading" className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Latest Updates
                  </h2>
                  <Link
                    to="/updates"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                {latestAnnouncements.length === 0 ? (
                  <SectionEmptyState
                    icon={Megaphone}
                    title="No updates yet"
                    description="Announcements and news from Tech Fleet will appear here."
                  />
                ) : (
                  <div className="space-y-2">
                    {latestAnnouncements.map((a) => (
                      <Link
                        key={a.id}
                        to="/updates"
                        className="card-elevated p-4 hover:border-primary/40 transition-all block border border-white/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-sm text-foreground truncate">{a.title}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{stripHtml(a.body_html).slice(0, 120)}</p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {format(new Date(a.created_at), "MMM d")}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ) : null;

          case "network_activity":
          case "world_map": {
            const lastNetworkIdx = widgetOrder.reduce((acc, w, i) => (w === "network_activity" || w === "world_map") ? i : acc, -1);
            if (widgetOrder[lastNetworkIdx] !== widgetId) return null;
            const showAny = isVisible("network_activity") || isVisible("world_map");
            return showAny ? (
              <section key="network" className="border-t pt-9">
                <Suspense fallback={<Skeleton className="h-[400px] rounded-lg" />}>
                  <NetworkActivity
                    showMap={isVisible("world_map")}
                    showActivity={isVisible("network_activity")}
                  />
                </Suspense>
              </section>
            ) : null;
          }

          default:
            return null;
        }
      })}

      {showEmptyState && (
        <DashboardEmptyState onCustomize={handleOpenCustomizer} />
      )}
    </div>
  );
}
