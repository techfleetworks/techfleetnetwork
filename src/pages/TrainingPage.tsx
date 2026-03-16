import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, ChevronRight, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TOTAL_AGILE_LESSONS, ALL_AGILE_LESSON_IDS } from "@/data/agile-course";

export default function TrainingPage() {
  const { user } = useAuth();
  const [agileCompleted, setAgileCompleted] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("journey_progress")
      .select("task_id")
      .eq("user_id", user.id)
      .eq("phase", "second_steps")
      .eq("completed", true)
      .then(({ data }) => {
        setAgileCompleted(data?.length ?? 0);
      });
  }, [user]);

  const agileProgress = Math.round(
    (agileCompleted / TOTAL_AGILE_LESSONS) * 100
  );
  const agileComplete = agileCompleted === TOTAL_AGILE_LESSONS;

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

      {/* Onboarding Courses */}
      <section aria-labelledby="onboarding-heading" className="mb-10">
        <h2
          id="onboarding-heading"
          className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"
        >
          <GraduationCap className="h-5 w-5 text-primary" />
          Onboarding Courses
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Agile Handbook Course */}
          <Link
            to="/journey/second-steps"
            className="card-elevated p-5 hover:border-primary/40 transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              {agileComplete ? (
                <Badge
                  variant="outline"
                  className="bg-success/10 text-success border-success/20 text-xs"
                >
                  Complete
                </Badge>
              ) : agileCompleted > 0 ? (
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
              Build an Agile Mindset
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {TOTAL_AGILE_LESSONS} lessons covering agile philosophies,
              teamwork, and scrum methods.
            </p>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {agileCompleted}/{TOTAL_AGILE_LESSONS} lessons
                </span>
                <span>{agileProgress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${agileProgress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs text-primary mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              Continue
              <ChevronRight className="h-3 w-3" />
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
