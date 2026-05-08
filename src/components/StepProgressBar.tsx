import { cn } from "@/lib/utils";
import { Check, Pencil } from "lucide-react";
import { useCallback, useRef, type KeyboardEvent } from "react";

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
  /** Optional: render each step as an `<a href>` for deep-linking and right-click open-in-new-tab.
   *  When provided alongside onStepClick, the click handler runs and `preventDefault` is called for
   *  unmodified left clicks so SPA behavior wins; modifier-clicks (Cmd/Ctrl/Shift/middle) fall
   *  through to the browser. */
  getStepHref?: (step: number) => string | undefined;
  className?: string;
}

/**
 * Reusable multi-step progress indicator. Each step (circle + label) is a single
 * accessible control. Supports pointer, keyboard (arrow keys + Enter/Space),
 * and optional anchor-based deep links.
 */
export function StepProgressBar({
  steps,
  currentStep,
  onStepClick,
  getStepHref,
  className,
}: StepProgressBarProps) {
  const buttonsRef = useRef<Array<HTMLElement | null>>([]);
  const isInteractive = !!onStepClick || !!getStepHref;

  const focusStep = useCallback((idx: number) => {
    const el = buttonsRef.current[idx];
    if (el) el.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, idx: number) => {
      if (!isInteractive) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        focusStep(Math.min(idx + 1, steps.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        focusStep(Math.max(idx - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        focusStep(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusStep(steps.length - 1);
      }
    },
    [focusStep, isInteractive, steps.length],
  );

  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <ol className="flex items-start w-full" role="list">
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === currentStep;
          const status = step.status ?? "not_started";
          const href = getStepHref?.(stepNum);
          const statusWord =
            status === "completed"
              ? "completed"
              : status === "started"
                ? "in progress"
                : "not started";
          const ariaLabel = `Go to step ${stepNum}: ${step.label} (${statusWord}${
            step.hasError ? ", has errors" : ""
          })`;

          // Roving tabindex: only the active step is in the tab order; arrows move focus.
          const tabIndex = isActive ? 0 : -1;

          const circle = (
            <span
              className={cn(
                "relative flex items-center justify-center shrink-0 rounded-full transition-all duration-300 font-semibold",
                "h-9 w-9 text-xs",
                isActive
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-lg shadow-primary/30"
                  : status === "completed"
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 group-hover:ring-2 group-hover:ring-primary/30"
                    : status === "started"
                      ? "bg-primary/15 text-primary border-2 border-primary/40 group-hover:bg-primary/25"
                      : "bg-muted text-muted-foreground/70 group-hover:bg-accent group-hover:text-accent-foreground",
                step.hasError && !isActive && "ring-2 ring-destructive/60",
              )}
              aria-hidden="true"
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
              {step.hasError && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background"
                />
              )}
            </span>
          );

          const label = (
            <span
              className={cn(
                "hidden sm:block mt-1.5 text-center text-[10px] leading-tight font-medium transition-colors px-1",
                isActive
                  ? "text-primary"
                  : status === "completed"
                    ? "text-muted-foreground group-hover:text-foreground"
                    : status === "started"
                      ? "text-primary/70 group-hover:text-primary"
                      : "text-muted-foreground/60 group-hover:text-foreground",
              )}
            >
              {step.label}
            </span>
          );

          // Combined target — circle + label inside one focusable element.
          // 44×44 minimum touch target on mobile (label is hidden, so we pad the circle area).
          const innerClassName = cn(
            "group flex flex-col items-center justify-start min-w-[44px] min-h-[44px] py-1 outline-none rounded-md",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isInteractive && "cursor-pointer",
          );

          const handleClick = (e: React.MouseEvent) => {
            // Let browser handle modifier-clicks on anchors (open in new tab/window).
            if (
              href &&
              (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as React.MouseEvent).button === 1)
            ) {
              return;
            }
            if (onStepClick) {
              if (href) e.preventDefault();
              onStepClick(stepNum);
            }
          };

          const inner =
            href !== undefined ? (
              <a
                ref={(el) => (buttonsRef.current[i] = el)}
                href={href}
                onClick={handleClick}
                onKeyDown={(e) => handleKeyDown(e, i)}
                tabIndex={isInteractive ? tabIndex : -1}
                aria-current={isActive ? "step" : undefined}
                aria-label={ariaLabel}
                className={innerClassName}
              >
                {circle}
                {label}
              </a>
            ) : (
              <button
                ref={(el) => (buttonsRef.current[i] = el)}
                type="button"
                onClick={onStepClick ? () => onStepClick(stepNum) : undefined}
                onKeyDown={(e) => handleKeyDown(e, i)}
                disabled={!onStepClick}
                tabIndex={isInteractive ? tabIndex : undefined}
                aria-current={isActive ? "step" : undefined}
                aria-label={ariaLabel}
                className={innerClassName}
              >
                {circle}
                {label}
              </button>
            );

          return (
            <li
              key={i}
              className={cn(
                "flex items-start",
                i < steps.length - 1 ? "flex-1" : "",
              )}
            >
              {inner}

              {/* Connector line — sits at the height of the circle (~18px) */}
              {i < steps.length - 1 && (
                <div className="flex-1 mx-1.5 sm:mx-2.5 h-0.5 mt-[22px] rounded-full overflow-hidden bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      status === "completed"
                        ? "bg-primary w-full"
                        : status === "started"
                          ? "bg-primary/40 w-full"
                          : "w-0",
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
