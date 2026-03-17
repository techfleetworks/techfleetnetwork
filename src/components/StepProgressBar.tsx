import { cn } from "@/lib/utils";
import { Check, Pencil } from "lucide-react";

type StepStatus = "not_started" | "started" | "completed";

interface Step {
  label: string;
  hasError?: boolean;
  status?: StepStatus;
}

interface StepProgressBarProps {
  steps: Step[];
  currentStep: number;
  /** Called when user clicks a step (1-indexed) */
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * Reusable multi-step progress indicator with clickable nodes.
 * Renders numbered circles connected by lines, with not_started/started/completed/active states.
 */
export function StepProgressBar({ steps, currentStep, onStepClick, className }: StepProgressBarProps) {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-center w-full" role="list">
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === currentStep;
          const status = step.status ?? "not_started";
          const isClickable = !!onStepClick;

          return (
            <li
              key={i}
              className={cn("flex items-center", i < steps.length - 1 ? "flex-1" : "")}
            >
              {/* Step node */}
              <button
                type="button"
                onClick={() => onStepClick?.(stepNum)}
                disabled={!isClickable}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${stepNum}: ${step.label}${step.hasError ? " (has errors)" : ""}${status === "completed" ? " (completed)" : status === "started" ? " (in progress)" : ""}`}
                className={cn(
                  "relative flex items-center justify-center shrink-0 rounded-full transition-all duration-300 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "h-9 w-9 text-xs",
                  isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-lg shadow-primary/30"
                    : status === "completed"
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                      : status === "started"
                        ? "bg-primary/15 text-primary border-2 border-primary/40"
                        : "bg-muted text-muted-foreground/60 hover:bg-accent hover:text-accent-foreground",
                  isClickable && !isActive && "cursor-pointer",
                  step.hasError && !isActive && "ring-2 ring-destructive/60",
                )}
              >
                {isActive ? (
                  stepNum
                ) : status === "completed" ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : status === "started" ? (
                  <Pencil className="h-3.5 w-3.5" />
                ) : (
                  stepNum
                )}
                {/* Error dot */}
                {step.hasError && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="flex-1 mx-1.5 sm:mx-2.5 h-0.5 rounded-full overflow-hidden bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      status === "completed" ? "bg-primary w-full"
                        : status === "started" ? "bg-primary/40 w-full"
                        : "w-0"
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Step labels — hidden on very small screens, shown on sm+ */}
      <div className="hidden sm:flex items-start w-full mt-2">
        {steps.map((step, i) => {
          const isActive = i + 1 === currentStep;
          const status = step.status ?? "not_started";
          return (
            <div
              key={i}
              className={cn(
                "text-center text-[10px] leading-tight font-medium transition-colors",
                i < steps.length - 1 ? "flex-1" : "",
                isActive
                  ? "text-primary"
                  : status === "completed"
                    ? "text-muted-foreground"
                    : status === "started"
                      ? "text-primary/60"
                      : "text-muted-foreground/40"
              )}
              style={{ minWidth: "2.25rem" }}
            >
              {step.label}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
