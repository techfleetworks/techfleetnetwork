import { Link } from "react-router-dom";
import { CheckCircle2, Circle, PartyPopper, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompletedCount } from "@/hooks/use-journey-progress";
import { TOTAL_FIRST_STEPS, FIRST_STEPS_TASK_IDS } from "@/pages/FirstStepsPage";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_DISCORD_LESSONS } from "@/data/discord-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { TOTAL_PROJECT_TRAINING_LESSONS } from "@/data/project-training-course";
import { TOTAL_VOLUNTEER_LESSONS } from "@/data/volunteer-teams-course";

interface ReadinessStep {
  label: string;
  completed: boolean;
  loading: boolean;
  href: string;
}

export function ReadinessChecklist() {
  const { user } = useAuth();
  const userId = user?.id;

  const firstStepsTotal = TOTAL_FIRST_STEPS;
  const { data: firstStepsCount = 0, isLoading: l1 } = useCompletedCount(userId, "first_steps", FIRST_STEPS_TASK_IDS);
  const { data: agileCount = 0, isLoading: l2 } = useCompletedCount(userId, "second_steps");
  const { data: discordCount = 0, isLoading: l3 } = useCompletedCount(userId, "discord_learning");
  const { data: teamworkCount = 0, isLoading: l4 } = useCompletedCount(userId, "third_steps");
  const { data: projectTrainingCount = 0, isLoading: l5 } = useCompletedCount(userId, "project_training");
  const { data: volunteerCount = 0, isLoading: l6 } = useCompletedCount(userId, "volunteer");

  if (!user) return null;

  const steps: ReadinessStep[] = [
    {
      label: "Finished Onboarding Steps",
      completed: firstStepsCount >= firstStepsTotal,
      loading: l1,
      href: "/courses/onboarding",
    },
    {
      label: "Finished Build an Agile Mindset",
      completed: agileCount >= TOTAL_AGILE_LESSONS,
      loading: l2,
      href: "/courses/agile-mindset",
    },
    {
      label: "Finished Discord Learning Series",
      completed: discordCount >= TOTAL_DISCORD_LESSONS,
      loading: l3,
      href: "/courses/discord-learning",
    },
    {
      label: "Finished Agile Cross-Functional Team Dynamics",
      completed: teamworkCount >= TOTAL_TEAMWORK_LESSONS,
      loading: l4,
      href: "/courses/agile-teamwork",
    },
    {
      label: "Finished Join Project Training Teams",
      completed: projectTrainingCount >= TOTAL_PROJECT_TRAINING_LESSONS,
      loading: l5,
      href: "/courses/project-training",
    },
    {
      label: "Finished Join Volunteer Teams",
      completed: volunteerCount >= TOTAL_VOLUNTEER_LESSONS,
      loading: l6,
      href: "/courses/volunteer-teams",
    },
  ];

  const allLoading = l1 || l2 || l3 || l4 || l5 || l6;
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
