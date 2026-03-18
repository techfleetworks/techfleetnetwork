import { Link } from "react-router-dom";
import { CheckCircle2, Circle, PartyPopper, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompletedCount, useFirstStepsTotalForUser } from "@/hooks/use-journey-progress";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { TOTAL_PROJECT_TRAINING_LESSONS } from "@/data/project-training-course";

interface ReadinessStep {
  label: string;
  completed: boolean;
  loading: boolean;
  href: string;
}

export function ReadinessChecklist() {
  const { user, profile } = useAuth();
  const userId = user?.id;

  const firstStepsTotal = useFirstStepsTotalForUser(profile);
  const { data: firstStepsCount = 0, isLoading: l1 } = useCompletedCount(userId, "first_steps");
  const { data: agileCount = 0, isLoading: l2 } = useCompletedCount(userId, "second_steps");
  const { data: teamworkCount = 0, isLoading: l3 } = useCompletedCount(userId, "third_steps");
  const { data: projectTrainingCount = 0, isLoading: l4 } = useCompletedCount(userId, "project_training");

  if (!user) return null;

  const steps: ReadinessStep[] = [
    {
      label: "Finished Onboarding Steps",
      completed: firstStepsCount >= firstStepsTotal,
      loading: l1,
      href: "/courses/onboarding",
    },
    {
      label: "Finished Building an Agile Mindset",
      completed: agileCount >= TOTAL_AGILE_LESSONS,
      loading: l2,
      href: "/courses/agile-mindset",
    },
    {
      label: "Finished Agile Teamwork Course",
      completed: teamworkCount >= TOTAL_TEAMWORK_LESSONS,
      loading: l3,
      href: "/courses/agile-teamwork",
    },
    {
      label: "Finished Join Project Training Course",
      completed: projectTrainingCount >= TOTAL_PROJECT_TRAINING_LESSONS,
      loading: l4,
      href: "/courses/project-training",
    },
  ];

  const allLoading = l1 || l2 || l3 || l4;
  const allComplete = !allLoading && steps.every((s) => s.completed);

  return (
    <div
      className="rounded-lg border bg-card p-5 sm:p-6 space-y-4"
      role="region"
      aria-label="Application readiness checklist"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {allComplete ? (
          <PartyPopper className="h-5 w-5 text-success shrink-0" aria-hidden="true" />
        ) : (
          <Circle className="h-5 w-5 text-warning shrink-0" aria-hidden="true" />
        )}
        <h3 className="text-lg font-semibold text-foreground">
          {allLoading ? "Checking readiness…" : allComplete ? "You are ready to apply!" : "You're almost ready!"}
        </h3>
      </div>

      {!allComplete && !allLoading && (
        <p className="text-sm text-muted-foreground">
          Complete the following courses before submitting your application.
        </p>
      )}

      {/* Checklist */}
      <ul className="space-y-3" aria-label="Readiness steps">
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-3">
            {step.loading ? (
              <div className="h-5 w-5 rounded-full bg-muted animate-pulse shrink-0 mt-0.5" />
            ) : step.completed ? (
              <CheckCircle2
                className="h-5 w-5 text-success shrink-0 mt-0.5"
                aria-label="Completed"
              />
            ) : (
              <Circle
                className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-0.5"
                aria-label="Not completed"
              />
            )}
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${
                  step.completed
                    ? "text-muted-foreground line-through"
                    : "text-foreground font-medium"
                }`}
              >
                {step.label}
              </span>
              {!step.completed && !step.loading && (
                <Link
                  to={step.href}
                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 w-fit"
                >
                  Go to course <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
