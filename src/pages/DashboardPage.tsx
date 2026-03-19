import { memo, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FolderKanban,
  Heart,
  Lock,
  Megaphone,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { NetworkActivity } from "@/components/NetworkActivity";
import { DashboardCustomizer } from "@/components/DashboardCustomizer";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { SectionEmptyState } from "@/components/SectionEmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCompletedCount, useFirstStepsTotalForUser } from "@/hooks/use-journey-progress";
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
import { useQuery } from "@/lib/react-query";

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

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const customizerRef = useRef<HTMLButtonElement>(null);

  const { visibleWidgets, widgetOrder, isVisible, toggleWidget, reorderWidgets, isNewUser, isLoading: prefsLoading } = useDashboardPreferences();

  const totalFirstSteps = useFirstStepsTotalForUser(profile);

  const { data: firstStepsCompleted = 0 } = useCompletedCount(userId, "first_steps");
  const { data: secondStepsCompleted = 0 } = useCompletedCount(userId, "second_steps");
  const { data: discordCompleted = 0 } = useCompletedCount(userId, "discord_learning");
  const { data: thirdStepsCompleted = 0 } = useCompletedCount(userId, "third_steps");
  const { data: projectTrainingCompleted = 0 } = useCompletedCount(userId, "project_training");
  const { data: volunteerCompleted = 0 } = useCompletedCount(userId, "volunteer");
  const { data: latestAnnouncements = [] } = useLatestAnnouncements(5);
  const { data: stats } = useQuery({
    queryKey: ["network-stats"],
    queryFn: () => StatsService.getNetworkStats(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: myProjectApps = [] } = useQuery({
    queryKey: ["dashboard-my-project-apps", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("id, project_id, status, completed_at, updated_at, current_step, team_hats_interest")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

  const projectIds = useMemo(() => [...new Set(myProjectApps.map((a) => a.project_id))], [myProjectApps]);
  const { data: dashProjects = [] } = useQuery({
    queryKey: ["dashboard-projects-for-apps", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("projects").select("id, client_id, project_type, phase, project_status").in("id", projectIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: projectIds.length > 0,
  });

  const dashClientIds = useMemo(() => [...new Set(dashProjects.map((p) => p.client_id))], [dashProjects]);
  const { data: dashClients = [] } = useQuery({
    queryKey: ["dashboard-clients-for-apps", dashClientIds],
    queryFn: async () => {
      if (dashClientIds.length === 0) return [];
      const { data, error } = await supabase
        .from("clients").select("id, name").in("id", dashClientIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: dashClientIds.length > 0,
  });

  const dashProjectMap = useMemo(() => new Map(dashProjects.map((p) => [p.id, p])), [dashProjects]);
  const dashClientMap = useMemo(() => new Map(dashClients.map((c) => [c.id, c])), [dashClients]);

  const communityBadgeCount = stats?.badges_earned ?? null;

  const allFirstStepsDone = totalFirstSteps > 0 && firstStepsCompleted >= totalFirstSteps;
  const allSecondStepsDone = secondStepsCompleted >= TOTAL_AGILE_LESSONS;
  const allDiscordDone = discordCompleted >= TOTAL_DISCORD_LESSONS;
  const allThirdStepsDone = thirdStepsCompleted >= TOTAL_TEAMWORK_LESSONS;
  const allProjectTrainingDone = projectTrainingCompleted >= TOTAL_PROJECT_TRAINING_LESSONS;
  const allVolunteerDone = volunteerCompleted >= TOTAL_VOLUNTEER_LESSONS;
  const allCoreCoursesDone = allFirstStepsDone && allSecondStepsDone && allDiscordDone && allThirdStepsDone && allProjectTrainingDone && allVolunteerDone;

  const coreCourses: CoreCourse[] = [
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
      title: "Learn About Agile Teamwork",
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
      prerequisiteLabel: "Learn About Agile Teamwork",
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
      prerequisiteLabel: "Learn About Agile Teamwork",
    },
  ];

  const displayName = profile?.first_name || profile?.display_name || user?.user_metadata?.full_name || "there";

  // Count how many togglable sections are visible (excluding core_courses which is always structural)
  const togglableSectionsVisible = visibleWidgets.filter((w) => w !== "core_courses").length;
  const showEmptyState = !prefsLoading && isNewUser && togglableSectionsVisible === 0;

  const handleOpenCustomizer = () => {
    customizerRef.current?.click();
  };

  return (
    <div className="container-app py-8 sm:py-12 space-y-9">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Welcome back, {displayName} 👋</h1>
          <p className="text-muted-foreground mt-1">Continue your journey through the Tech Fleet training platform.</p>
        </div>
        <div className="flex-shrink-0 pt-1">
          <DashboardCustomizer
            visibleWidgets={visibleWidgets}
            widgetOrder={widgetOrder}
            onToggle={toggleWidget}
            onReorder={reorderWidgets}
          />
        </div>
      </div>

      {widgetOrder.map((widgetId) => {
        switch (widgetId) {
          case "badges":
            return isVisible("badges") ? (
              <section key="badges">
                <BadgesDisplay
                  allFirstStepsDone={allFirstStepsDone}
                  allSecondStepsDone={allSecondStepsDone}
                  allThirdStepsDone={allThirdStepsDone}
                  communityBadgeCount={communityBadgeCount}
                />
              </section>
            ) : null;

          case "core_courses":
            return isVisible("core_courses") && !allCoreCoursesDone ? (
              <section key="core_courses" aria-labelledby="core-courses-heading">
                <h2 id="core-courses-heading" className="text-xl font-semibold text-foreground mb-4">
                  Core Courses
                </h2>
                <div className="space-y-2">
                  {coreCourses.map((course) => (
                    <CoreCourseCard key={course.id} course={course} />
                  ))}
                </div>
              </section>
            ) : null;

          case "my_project_apps":
            return isVisible("my_project_apps") ? (
              <section key="my_project_apps" aria-labelledby="my-apps-heading">
                <div className="flex items-center justify-between mb-4">
                  <h2 id="my-apps-heading" className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <FolderKanban className="h-5 w-5 text-primary" />
                    My Project Applications
                  </h2>
                  <Link
                    to="/applications/projects"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
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

                      return (
                        <Link
                          key={app.id}
                          to={`/project-openings/${app.project_id}/apply`}
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
                                {isCompleted ? (
                                  <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0 gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Submitted
                                  </Badge>
                                ) : isDraft ? (
                                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs flex-shrink-0 gap-1">
                                    <Clock className="h-3 w-3" />
                                    In Progress
                                  </Badge>
                                ) : null}
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
            // Render the combined network section only once, at whichever comes last in order
            const lastNetworkIdx = widgetOrder.reduce((acc, w, i) => (w === "network_activity" || w === "world_map") ? i : acc, -1);
            if (widgetOrder[lastNetworkIdx] !== widgetId) return null;
            const showAny = isVisible("network_activity") || isVisible("world_map");
            return showAny ? (
              <section key="network" className="border-t pt-9">
                <NetworkActivity
                  showMap={isVisible("world_map")}
                  showActivity={isVisible("network_activity")}
                />
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
