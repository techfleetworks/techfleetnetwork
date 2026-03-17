import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Heart,
  Lock,
  Megaphone,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { NetworkActivity } from "@/components/NetworkActivity";
import { useAuth } from "@/contexts/AuthContext";
import { JourneyService } from "@/services/journey.service";
import { StatsService } from "@/services/stats.service";
import { AnnouncementService, type Announcement } from "@/services/announcement.service";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_DISCORD_LESSONS } from "@/data/discord-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { TOTAL_PROJECT_TRAINING_LESSONS } from "@/data/project-training-course";
import { TOTAL_VOLUNTEER_LESSONS } from "@/data/volunteer-teams-course";
import { format } from "date-fns";

const totalFirstSteps = 6;

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

function CoreCourseCard({ course }: { course: CoreCourse }) {
  const progress =
    course.totalTasks > 0
      ? Math.round((course.completedTasks / course.totalTasks) * 100)
      : 0;
  const isComplete =
    course.totalTasks > 0 && course.completedTasks >= course.totalTasks;
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
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [firstStepsCompleted, setFirstStepsCompleted] = useState<number | null>(null);
  const [secondStepsCompleted, setSecondStepsCompleted] = useState<number | null>(null);
  const [discordCompleted, setDiscordCompleted] = useState<number | null>(null);
  const [thirdStepsCompleted, setThirdStepsCompleted] = useState<number | null>(null);
  const [projectTrainingCompleted, setProjectTrainingCompleted] = useState<number | null>(null);
  const [volunteerCompleted, setVolunteerCompleted] = useState<number | null>(null);
  const [communityBadgeCount, setCommunityBadgeCount] = useState<number | null>(null);
  const [latestAnnouncements, setLatestAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      JourneyService.getCompletedCount(user.id, "first_steps"),
      JourneyService.getCompletedCount(user.id, "second_steps"),
      JourneyService.getCompletedCount(user.id, "discord_learning"),
      JourneyService.getCompletedCount(user.id, "third_steps"),
      JourneyService.getCompletedCount(user.id, "project_training"),
      JourneyService.getCompletedCount(user.id, "volunteer"),
      StatsService.getNetworkStats(),
    ]).then(([first, second, discord, third, pt, vol, stats]) => {
      setFirstStepsCompleted(first);
      setSecondStepsCompleted(second);
      setDiscordCompleted(discord);
      setThirdStepsCompleted(third);
      setProjectTrainingCompleted(pt);
      setVolunteerCompleted(vol);
      setCommunityBadgeCount(stats.badges_earned ?? 0);
    });
  }, [user]);

  const allFirstStepsDone = firstStepsCompleted !== null && firstStepsCompleted >= totalFirstSteps;
  const allSecondStepsDone = secondStepsCompleted !== null && secondStepsCompleted >= TOTAL_AGILE_LESSONS;
  const allDiscordDone = discordCompleted !== null && discordCompleted >= TOTAL_DISCORD_LESSONS;
  const allThirdStepsDone = thirdStepsCompleted !== null && thirdStepsCompleted >= TOTAL_TEAMWORK_LESSONS;
  const allProjectTrainingDone = projectTrainingCompleted !== null && projectTrainingCompleted >= TOTAL_PROJECT_TRAINING_LESSONS;
  const allVolunteerDone = volunteerCompleted !== null && volunteerCompleted >= TOTAL_VOLUNTEER_LESSONS;

  const allCoreCoursesDone = allFirstStepsDone && allSecondStepsDone && allDiscordDone && allThirdStepsDone && allProjectTrainingDone && allVolunteerDone;

  const coreCourses: CoreCourse[] = [
    {
      id: "onboarding",
      title: "Onboarding Steps",
      description: "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.",
      icon: ClipboardCheck,
      href: "/courses/onboarding",
      totalTasks: totalFirstSteps,
      completedTasks: firstStepsCompleted ?? 0,
      locked: false,
    },
    {
      id: "agile-mindset",
      title: "Build an Agile Mindset",
      description: `${TOTAL_AGILE_LESSONS} lessons covering agile philosophies, teamwork, and scrum methods.`,
      icon: BookOpen,
      href: "/courses/agile-mindset",
      totalTasks: TOTAL_AGILE_LESSONS,
      completedTasks: secondStepsCompleted ?? 0,
      locked: false,
    },
    {
      id: "discord-learning",
      title: "Discord Learning Series",
      description: `${TOTAL_DISCORD_LESSONS} lessons on getting started and interacting in Tech Fleet Discord.`,
      icon: Users,
      href: "/courses/discord-learning",
      totalTasks: TOTAL_DISCORD_LESSONS,
      completedTasks: discordCompleted ?? 0,
      locked: false,
    },
    {
      id: "agile-teamwork",
      title: "Learn About Agile Teamwork",
      description: `${TOTAL_TEAMWORK_LESSONS} lessons from the Teammate Handbook.`,
      icon: Users,
      href: "/courses/agile-teamwork",
      totalTasks: TOTAL_TEAMWORK_LESSONS,
      completedTasks: thirdStepsCompleted ?? 0,
      locked: false,
    },
    {
      id: "project-training",
      title: "Join Project Training Teams",
      description: `${TOTAL_PROJECT_TRAINING_LESSONS} lessons on apprenticeship training and nonprofit clients.`,
      icon: Briefcase,
      href: "/courses/project-training",
      totalTasks: TOTAL_PROJECT_TRAINING_LESSONS,
      completedTasks: projectTrainingCompleted ?? 0,
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
      completedTasks: volunteerCompleted ?? 0,
      locked: !allThirdStepsDone,
      prerequisiteLabel: "Learn About Agile Teamwork",
    },
  ];

  const displayName = profile?.first_name || profile?.display_name || user?.user_metadata?.full_name || "there";

  return (
    <div className="container-app py-8 sm:py-12 space-y-9">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Welcome back, {displayName} 👋</h1>
        <p className="text-muted-foreground mt-1">Continue your journey through the Tech Fleet training platform.</p>
      </div>

      <section>
        <BadgesDisplay
          allFirstStepsDone={allFirstStepsDone}
          allSecondStepsDone={allSecondStepsDone}
          allThirdStepsDone={allThirdStepsDone}
          communityBadgeCount={communityBadgeCount}
        />
      </section>

      {!allCoreCoursesDone && (
        <section aria-labelledby="core-courses-heading">
          <h2 id="core-courses-heading" className="text-xl font-semibold text-foreground mb-4">
            Core Courses
          </h2>
          <div className="space-y-2">
            {coreCourses.map((course) => (
              <CoreCourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      )}

      <section className="border-t pt-9">
        <NetworkActivity />
      </section>
    </div>
  );
}
