import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, ChevronRight, ClipboardCheck, Eye, GraduationCap, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { JourneyService } from "@/services/journey.service";

interface CourseCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  totalTasks: number;
  completedTasks: number;
}

export default function TrainingPage() {
  const { user } = useAuth();
  const [firstCompleted, setFirstCompleted] = useState(0);
  const [agileCompleted, setAgileCompleted] = useState(0);
  const totalFirstSteps = 6;

  useEffect(() => {
    if (!user) return;
    Promise.all([
      JourneyService.getCompletedCount(user.id, "first_steps"),
      JourneyService.getCompletedCount(user.id, "second_steps"),
    ]).then(([first, second]) => {
      setFirstCompleted(first);
      setAgileCompleted(second);
    });
  }, [user]);

  const courses: CourseCard[] = [
    {
      id: "onboarding",
      title: "Onboarding Steps",
      description: "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.",
      icon: ClipboardCheck,
      href: "/journey/first-steps",
      totalTasks: totalFirstSteps,
      completedTasks: firstCompleted,
    },
    {
      id: "agile-mindset",
      title: "Build an Agile Mindset",
      description: `${TOTAL_AGILE_LESSONS} lessons covering agile philosophies, teamwork, and scrum methods.`,
      icon: BookOpen,
      href: "/journey/second-steps",
      totalTasks: TOTAL_AGILE_LESSONS,
      completedTasks: agileCompleted,
    },
    {
      id: "agile-teamwork",
      title: "Learn About Agile Teamwork",
      description: "Read the Teammate Handbook and pass the comprehension quiz to demonstrate your understanding.",
      icon: Users,
      href: "/journey/third-steps",
      totalTasks: 0,
      completedTasks: 0,
    },
    {
      id: "observe-teams",
      title: "Observe Project Teams",
      description: "Complete a 2-week observation period with daily posts, meeting attendance, and reflections.",
      icon: Eye,
      href: "/journey/observer",
      totalTasks: 0,
      completedTasks: 0,
    },
  ];

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Training
        </h1>
        <p className="text-muted-foreground mt-1">
          Courses and learning paths to grow your skills and mindset.
        </p>
      </div>

      <section aria-labelledby="courses-heading">
        <h2
          id="courses-heading"
          className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"
        >
          <GraduationCap className="h-5 w-5 text-primary" />
          Member Journey Courses
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
          {courses.map((course) => {
            const progress = course.totalTasks > 0
              ? Math.round((course.completedTasks / course.totalTasks) * 100)
              : 0;
            const isComplete = course.totalTasks > 0 && course.completedTasks >= course.totalTasks;
            const isStarted = course.completedTasks > 0;
            const Icon = course.icon;

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
                    <Badge
                      variant="outline"
                      className="bg-success/10 text-success border-success/20 text-xs"
                    >
                      Complete
                    </Badge>
                  ) : isStarted ? (
                    <Badge
                      variant="outline"
                      className="bg-warning/10 text-warning border-warning/20 text-xs"
                    >
                      In Progress
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Not Started
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                  {course.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {course.description}
                </p>

                {course.totalTasks > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {course.completedTasks}/{course.totalTasks} tasks
                      </span>
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

                {course.totalTasks === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    Coming soon
                  </p>
                )}

                <div className="flex items-center gap-1 text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isComplete ? "Review" : isStarted ? "Continue" : "Start"}
                  <ChevronRight className="h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
