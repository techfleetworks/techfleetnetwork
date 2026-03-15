import { CheckCircle2, Circle, Lock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface JourneyStep {
  id: string;
  title: string;
  description: string;
  status: "completed" | "current" | "locked";
  href: string;
}

interface JourneyStepCardProps {
  step: JourneyStep;
  index: number;
}

export function JourneyStepCard({ step, index }: JourneyStepCardProps) {
  const statusIcon = {
    completed: <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />,
    current: <Circle className="h-6 w-6 text-primary" aria-hidden="true" />,
    locked: <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />,
  };

  const statusLabel = {
    completed: "Completed",
    current: "In Progress",
    locked: "Locked",
  };

  const isClickable = step.status !== "locked";

  const content = (
    <div
      className={`card-elevated p-5 transition-all duration-200 ${
        step.status === "current"
          ? "border-primary/50 shadow-md shadow-primary/5"
          : step.status === "locked"
          ? "opacity-60"
          : "hover:border-success/30"
      } ${isClickable ? "hover:shadow-md" : ""}`}
      role="article"
      aria-label={`Step ${index + 1}: ${step.title} — ${statusLabel[step.status]}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          {statusIcon[step.status]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground">Step {index + 1}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                step.status === "completed"
                  ? "bg-success/10 text-success"
                  : step.status === "current"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {statusLabel[step.status]}
            </span>
          </div>
          <h3 className="font-semibold text-foreground">{step.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
        </div>
        {isClickable && (
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  if (isClickable) {
    return (
      <Link to={step.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        {content}
      </Link>
    );
  }

  return content;
}
