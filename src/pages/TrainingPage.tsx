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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_DISCORD_LESSONS } from "@/data/discord-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { TOTAL_PROJECT_TRAINING_LESSONS } from "@/data/project-training-course";
import { TOTAL_VOLUNTEER_LESSONS } from "@/data/volunteer-teams-course";
import { useCompletedCount, useFirstStepsTotalForUser } from "@/hooks/use-journey-progress";

  const allTeamworkDone = teamworkCompleted >= TOTAL_TEAMWORK_LESSONS;

  const coreCourses: CourseCard[] = [
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
      title: "Learn About Agile Teamwork",
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
      prerequisiteLabel: "Learn About Agile Teamwork",
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
      prerequisiteLabel: "Learn About Agile Teamwork",
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



      <Tabs defaultValue="core" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="core" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Core Courses
          </TabsTrigger>
          <TabsTrigger value="beginner" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Beginner Courses
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Rocket className="h-4 w-4" />
            Advanced Courses
          </TabsTrigger>
        </TabsList>

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
