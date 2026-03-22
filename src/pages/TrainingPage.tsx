import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  Users,
  Lock,
  Briefcase,
  Heart,
  Lightbulb,
  Rocket,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_DISCORD_LESSONS } from "@/data/discord-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { TOTAL_PROJECT_TRAINING_LESSONS } from "@/data/project-training-course";
import { TOTAL_VOLUNTEER_LESSONS } from "@/data/volunteer-teams-course";
import { useCompletedCount } from "@/hooks/use-journey-progress";
import { TOTAL_FIRST_STEPS, FIRST_STEPS_TASK_IDS } from "@/pages/FirstStepsPage";

interface CourseCard {
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

function CourseGrid({ courses }: { courses: CourseCard[] }) {
  if (courses.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No courses in this category yet. Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
      {courses.map((course) => {
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
              key={course.id}
              className="card-elevated p-5 opacity-50 cursor-not-allowed relative overflow-hidden"
              aria-label={`${course.title} — Locked. Complete ${course.prerequisiteLabel} first.`}
            >
              <div className="absolute inset-x-0 top-0 bg-muted-foreground/80 text-background text-sm font-bold uppercase tracking-widest py-2 text-center pointer-events-none">
                Locked
              </div>
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/20 text-xs gap-1">
                  <Lock className="h-3 w-3" />
                  Locked
                </Badge>
              </div>
              <h3 className="font-semibold text-muted-foreground mb-1">{course.title}</h3>
              <p className="text-sm text-muted-foreground/70 mb-3">{course.description}</p>
              <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 rounded-md px-2.5 py-1.5 mt-2">
                <Lock className="h-3 w-3 flex-shrink-0" />
                <span>
                  Requires: <strong className="text-warning">{course.prerequisiteLabel}</strong>
                </span>
              </div>
            </div>
          );
        }

        return (
          <Link
            key={course.id}
            to={course.href}
            className="card-elevated p-5 hover:border-primary/40 transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              {isComplete ? (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">
                  Complete
                </Badge>
              ) : isStarted ? (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
                  In Progress
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Not Started</Badge>
              )}
            </div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
              {course.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">{course.description}</p>
            {course.totalTasks > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{course.completedTasks}/{course.totalTasks} tasks</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              {isComplete ? "Review" : isStarted ? "Continue" : "Start"}
              <ChevronRight className="h-3 w-3" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function TrainingPage() {
  const { user, profile } = useAuth();
  const userId = user?.id;

  const totalFirstSteps = TOTAL_FIRST_STEPS;

  const { data: firstCompleted = 0 } = useCompletedCount(userId, "first_steps", FIRST_STEPS_TASK_IDS);
  const { data: agileCompleted = 0 } = useCompletedCount(userId, "second_steps");
  const { data: discordCompleted = 0 } = useCompletedCount(userId, "discord_learning");
  const { data: teamworkCompleted = 0 } = useCompletedCount(userId, "third_steps");
  const { data: projectTrainingCompleted = 0 } = useCompletedCount(userId, "project_training");
  const { data: volunteerCompleted = 0 } = useCompletedCount(userId, "volunteer");

  const allTeamworkDone = teamworkCompleted >= TOTAL_TEAMWORK_LESSONS;

  const gettingStartedCourses: CourseCard[] = [
    {
      id: "onboarding",
      title: "Onboarding Steps",
      description: "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.",
      icon: ClipboardCheck,
      href: "/courses/onboarding",
      totalTasks: totalFirstSteps,
      completedTasks: firstCompleted,
      locked: false,
    },
  ];

  const coreCourses: CourseCard[] = [
    {
      id: "agile-mindset",
      title: "Build an Agile Mindset",
      description: `${TOTAL_AGILE_LESSONS} lessons covering agile philosophies, teamwork, and scrum methods.`,
      icon: BookOpen,
      href: "/courses/agile-mindset",
      totalTasks: TOTAL_AGILE_LESSONS,
      completedTasks: agileCompleted,
      locked: false,
    },
    {
      id: "discord-learning",
      title: "Discord Learning Series",
      description: `${TOTAL_DISCORD_LESSONS} lessons on getting started, security, and interacting in Tech Fleet Discord.`,
      icon: Users,
      href: "/courses/discord-learning",
      totalTasks: TOTAL_DISCORD_LESSONS,
      completedTasks: discordCompleted,
      locked: false,
    },
    {
      id: "agile-teamwork",
      title: "Agile Cross-Functional Team Dynamics",
      description: `${TOTAL_TEAMWORK_LESSONS} lessons from the Teammate Handbook covering team expectations, cross-functional work, and leadership.`,
      icon: Users,
      href: "/courses/agile-teamwork",
      totalTasks: TOTAL_TEAMWORK_LESSONS,
      completedTasks: teamworkCompleted,
      locked: false,
    },
    {
      id: "project-training",
      title: "Join Project Training Teams",
      description: `${TOTAL_PROJECT_TRAINING_LESSONS} lessons on how apprenticeship training works, working with nonprofit clients, and building case studies.`,
      icon: Briefcase,
      href: "/courses/project-training",
      totalTasks: TOTAL_PROJECT_TRAINING_LESSONS,
      completedTasks: projectTrainingCompleted,
      locked: !allTeamworkDone,
      prerequisiteLabel: "Agile Cross-Functional Team Dynamics",
    },
    {
      id: "volunteer-teams",
      title: "Join Volunteer Teams",
      description: `${TOTAL_VOLUNTEER_LESSONS} lessons on volunteering at Tech Fleet, team dynamics, and finding your volunteer role.`,
      icon: Heart,
      href: "/courses/volunteer-teams",
      totalTasks: TOTAL_VOLUNTEER_LESSONS,
      completedTasks: volunteerCompleted,
      locked: !allTeamworkDone,
      prerequisiteLabel: "Agile Cross-Functional Team Dynamics",
    },
  ];

  const beginnerCourses: CourseCard[] = [];
  const advancedCourses: CourseCard[] = [];

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Courses</h1>
        <p className="text-muted-foreground mt-1">
          Courses and learning paths to grow your skills and mindset.
        </p>
      </div>

      <Tabs defaultValue="getting-started" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="getting-started" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Getting Started
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold text-white ${gettingStartedCourses.length > 0 ? "bg-[#1d4ed8]" : "bg-[#52525b]"}`}>
              {gettingStartedCourses.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="core" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Core Courses
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold text-white ${coreCourses.length > 0 ? "bg-[#1d4ed8]" : "bg-[#52525b]"}`}>
              {coreCourses.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="beginner" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Beginner Courses
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold text-white ${beginnerCourses.length > 0 ? "bg-[#1d4ed8]" : "bg-[#52525b]"}`}>
              {beginnerCourses.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Rocket className="h-4 w-4" />
            Advanced Courses
            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold text-white ${advancedCourses.length > 0 ? "bg-[#1d4ed8]" : "bg-[#52525b]"}`}>
              {advancedCourses.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="getting-started">
          <CourseGrid courses={gettingStartedCourses} />
        </TabsContent>

        <TabsContent value="core">
          <CourseGrid courses={coreCourses} />
        </TabsContent>

        <TabsContent value="beginner">
          <CourseGrid courses={beginnerCourses} />
        </TabsContent>

        <TabsContent value="advanced">
          <CourseGrid courses={advancedCourses} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
