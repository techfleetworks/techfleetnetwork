import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, CheckCircle2, Circle, Clock, ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuestSteps, useCompleteSelfReportStep, useRemoveQuestPath } from "@/hooks/use-quest";
import { isStepCompleted } from "./QuestRoadmap";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { QuestPath } from "@/services/quest.service";

// Course phase to route mapping
const COURSE_ROUTES: Record<string, string> = {
  first_steps: "/courses/onboarding",
  second_steps: "/courses/agile-mindset",
  third_steps: "/courses/agile-teamwork",
  observer: "/courses/observer",
  discord_learning: "/courses/discord-learning",
  project_training: "/courses/project-training",
  volunteer: "/courses/volunteer-teams",
};

interface QuestPathDetailProps {
  path: QuestPath;
  onBack: () => void;
  allProgress: Map<string, { completed: number; total: number }>;
  selfReportProgress: Map<string, boolean> | undefined;
  completedPathSlugs: Set<string>;
  allPaths: QuestPath[];
}

export function QuestPathDetail({
  path,
  onBack,
  allProgress,
  selfReportProgress: parentSelfReport,
}: QuestPathDetailProps) {
  const { profile } = useAuth();
  const { data: steps, isLoading } = useQuestSteps(path.id);
  const completeSelfReport = useCompleteSelfReportStep();
  const removePath = useRemoveQuestPath();
  const [confirmStepId, setConfirmStepId] = useState<string | null>(null);
  const [confirmUncomplete, setConfirmUncomplete] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Use parent-provided progress directly — no redundant fetch
  const selfReportProgress = parentSelfReport;

  const stepCompletions = useMemo(() => {
    if (!steps) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (const step of steps) {
      map.set(step.id, isStepCompleted(step, allProgress, selfReportProgress, profile));
    }
    return map;
  }, [steps, allProgress, selfReportProgress, profile]);

  const completedCount = useMemo(() => {
    let count = 0;
    for (const val of stepCompletions.values()) {
      if (val) count++;
    }
    return count;
  }, [stepCompletions]);

  const totalSteps = steps?.length ?? 0;
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  // Find "you are here" phase index
  const currentPhaseIndex = useMemo(() => {
    if (!path.duration_phases.length || !steps) return -1;
    // Estimate based on step progress
    const ratio = completedCount / Math.max(totalSteps, 1);
    return Math.min(Math.floor(ratio * path.duration_phases.length), path.duration_phases.length - 1);
  }, [path.duration_phases, completedCount, totalSteps, steps]);

  const handleConfirmComplete = async () => {
    if (!confirmStepId) return;
    try {
      await completeSelfReport.mutateAsync({ stepId: confirmStepId, completed: true });
      toast.success("Step completed!");
    } catch {
      // Error handled by hook
    }
    setConfirmStepId(null);
  };

  const handleConfirmUncomplete = async () => {
    if (!confirmUncomplete) return;
    try {
      await completeSelfReport.mutateAsync({ stepId: confirmUncomplete, completed: false });
      toast.success("Step marked as incomplete");
    } catch {
      // Error handled by hook
    }
    setConfirmUncomplete(null);
  };

  const handleRemovePath = async () => {
    try {
      await removePath.mutateAsync(path.id);
      onBack();
    } catch {
      // Error handled by hook
    }
    setShowRemoveConfirm(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to My Journey
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setShowRemoveConfirm(true)}>
          Remove Path
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            path.level === "advanced" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"
          )}>
            {path.level === "advanced" ? "Advanced" : "Beginner"} Path
          </span>
        </div>
        <h2 className="text-2xl font-bold text-foreground">{path.title}</h2>
        <p className="text-muted-foreground mt-1">{path.description}</p>
      </div>

      {/* Timeline */}
      {path.duration_phases.length > 1 && (
        <div aria-label={`Estimated time to complete: ${path.estimated_duration}`}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Estimated Time: {path.estimated_duration}</span>
          </div>
          <div className="relative flex items-center" role="list" aria-label="Duration phases">
            {/* Connecting line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-border" aria-hidden="true" />
            {/* Completed portion of line */}
            <div
              className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500"
              style={{ width: `${((currentPhaseIndex) / Math.max(path.duration_phases.length - 1, 1)) * 100}%` }}
              aria-hidden="true"
            />

            {path.duration_phases.map((phase, i) => {
              const isCompleted = i < currentPhaseIndex;
              const isCurrent = i === currentPhaseIndex;
              const _isFuture = i > currentPhaseIndex;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center relative z-10"
                  role="listitem"
                >
                  {/* Node circle */}
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                      isCompleted
                        ? "bg-primary border-primary"
                        : isCurrent
                        ? "bg-background border-primary ring-4 ring-primary/20"
                        : "bg-background border-muted-foreground/30"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                    ) : isCurrent ? (
                      <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Duration label */}
                  <p className={cn(
                    "text-xs font-semibold mt-2 text-center",
                    isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {phase.duration}
                  </p>

                  {/* Phase label */}
                  <p className={cn(
                    "text-[11px] text-center mt-0.5 max-w-[100px]",
                    isCurrent ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {phase.label}
                  </p>

                  {/* You are here indicator */}
                  {isCurrent && (
                    <span className="mt-1.5 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      You are here
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Progress</span>
          <span className="text-sm text-muted-foreground">{completedCount} of {totalSteps} steps</span>
        </div>
        <Progress value={progressPercent} className="h-2.5" />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Steps</h3>
        {steps?.map((step, index) => {
          const isComplete = stepCompletions.get(step.id) ?? false;
          const prevComplete = index === 0 || (stepCompletions.get(steps[index - 1].id) ?? false);
          const isCurrent = !isComplete && prevComplete;
          const isFuture = !isComplete && !isCurrent;

          return (
            <div
              key={step.id}
              className={cn(
                "card-elevated p-4 transition-all duration-200",
                isCurrent ? "border-primary/50 shadow-sm shadow-primary/5" : "",
                isFuture ? "opacity-50" : ""
              )}
              role="listitem"
              aria-label={`Step ${index + 1}: ${step.title} — ${isComplete ? "completed" : isCurrent ? "current" : "upcoming"}`}
            >
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : isCurrent ? (
                    <Circle className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-muted-foreground">Step {index + 1}</span>
                    {step.step_type === "course" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">COURSE</span>
                    )}
                    {step.step_type === "system_verified" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success">VERIFIED</span>
                    )}
                    {step.step_type === "application" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">APP</span>
                    )}
                  </div>
                  <h4 className="font-medium text-foreground">{step.title}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>

                  {/* Course step: show progress + link */}
                  {step.step_type === "course" && step.linked_phase && (
                    <div className="mt-2 space-y-1">
                      {isComplete ? (
                        <p className="text-xs text-success">Auto-verified from course progress</p>
                      ) : (
                        <>
                          {allProgress.get(step.linked_phase) && (
                            <div className="flex items-center gap-2">
                              <Progress
                                value={(() => {
                                  const p = allProgress.get(step.linked_phase!);
                                  return p ? (p.completed / Math.max(p.total, 1)) * 100 : 0;
                                })()}
                                className="h-1.5 flex-1 max-w-[200px]"
                              />
                              <span className="text-xs text-muted-foreground">
                                {allProgress.get(step.linked_phase!)?.completed ?? 0} lessons
                              </span>
                            </div>
                          )}
                          {COURSE_ROUTES[step.linked_phase] && (
                            <Link
                              to={COURSE_ROUTES[step.linked_phase]}
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              Go to Course <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Self-report step: show complete button or completed state */}
                  {step.step_type === "self_report" && isCurrent && !isComplete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setConfirmStepId(step.id)}
                    >
                      I have completed this step
                    </Button>
                  )}

                  {step.step_type === "self_report" && isComplete && (
                    <button
                      onClick={() => setConfirmUncomplete(step.id)}
                      className="text-xs text-muted-foreground hover:text-foreground underline mt-1"
                    >
                      Mark as incomplete
                    </button>
                  )}

                  {/* System verified: show data source */}
                  {step.step_type === "system_verified" && isComplete && (
                    <p className="text-xs text-success mt-1">Verified automatically from your data</p>
                  )}

                  {/* Application step */}
                  {step.step_type === "application" && !isComplete && isCurrent && (
                    <Link
                      to={step.linked_table === "general_applications" ? "/applications/general" : "/project-openings"}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                    >
                      Go to Application <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}

                  {/* Future step placeholder */}
                  {isFuture && (
                    <p className="text-xs text-muted-foreground mt-1">Available after step {index}</p>
                  )}
                </div>

                {isCurrent && (
                  <span className="text-xs font-medium text-primary flex-shrink-0 mt-1">← YOU</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm self-report completion dialog */}
      <AlertDialog open={!!confirmStepId} onOpenChange={() => setConfirmStepId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark step as complete?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you've completed this step? You can undo this later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmComplete}>Yes, I've completed it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm uncomplete dialog */}
      <AlertDialog open={!!confirmUncomplete} onOpenChange={() => setConfirmUncomplete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark step as incomplete?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the step as not completed. You can re-complete it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUncomplete}>Mark Incomplete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove path confirmation */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{path.title}" from your journey?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress will be preserved if you add this path back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemovePath} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Path
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
