import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQuestPaths,
  useAllQuestSteps,
  useUserQuestSelections,
  useSelfReportProgress,
  useAllJourneyProgress,
} from "@/hooks/use-quest";
import { isStepCompleted } from "./QuestRoadmap";
import type { QuestPath, QuestPathStep } from "@/services/quest.service";

/** Only these three slugs are shown */
const FEATURED_SLUGS = ["client-projects", "learn-skills", "volunteer"] as const;

const QUEST_LABELS: Record<string, string> = {
  "client-projects": "GET REAL AGILE TEAM EXPERIENCE",
  "learn-skills": "TAKE CLASSES",
  volunteer: "VOLUNTEER",
};

export function ControlCenterOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: paths, isLoading: pathsLoading } = useQuestPaths();
  const { data: allSteps } = useAllQuestSteps();
  const { data: selections, isLoading: selectionsLoading } = useUserQuestSelections();
  const { data: selfReportProgress } = useSelfReportProgress();
  const { data: allJourneyMap } = useAllJourneyProgress();

  const allProgress = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    if (!allJourneyMap) return map;
    for (const [phase, tasks] of allJourneyMap.entries()) {
      const completed = tasks.filter((t) => t.completed).length;
      map.set(phase, { completed, total: tasks.length });
    }
    return map;
  }, [allJourneyMap]);

  const pathProgress = useMemo(() => {
    const result = new Map<string, { completed: number; total: number; nextStep?: QuestPathStep }>();
    if (!paths || !allSteps) return result;
    for (const path of paths) {
      const steps = allSteps.filter((s) => s.path_id === path.id);
      let completed = 0;
      let nextStep: QuestPathStep | undefined;
      for (const step of steps) {
        if (isStepCompleted(step, allProgress, selfReportProgress, profile)) {
          completed++;
        } else if (!nextStep) {
          nextStep = step;
        }
      }
      result.set(path.id, { completed, total: steps.length, nextStep });
    }
    return result;
  }, [paths, allSteps, allProgress, selfReportProgress, profile]);

  const featuredPaths = useMemo(() => {
    if (!paths) return [];
    return FEATURED_SLUGS.map((slug) => paths.find((p) => p.slug === slug)).filter(
      (p): p is QuestPath => !!p
    );
  }, [paths]);

  const subscribedIds = useMemo(() => {
    if (!selections) return new Set<string>();
    return new Set(selections.map((s) => s.path_id));
  }, [selections]);

  const handleClick = useCallback(
    (path: QuestPath) => {
      navigate(`/my-journey/quest/${path.id}`);
    },
    [navigate]
  );

  if (pathsLoading || selectionsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading control center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto" role="region" aria-label="Quest Control Center">
      {/* Outer panel frame */}
      <div className="relative rounded-xl border-4 border-[hsl(0,3%,36%)] bg-[hsl(0,10%,77%)] p-4 sm:p-6 shadow-xl">
        {/* Corner screws */}
        <Screw className="absolute top-3 left-3" />
        <Screw className="absolute top-3 right-3" />
        <Screw className="absolute bottom-3 left-3" />
        <Screw className="absolute bottom-3 right-3" />

        {/* Title bar */}
        <div className="text-center mb-6 sm:mb-8">
          <h2
            className="text-xl sm:text-2xl md:text-3xl font-bold tracking-[0.2em] uppercase"
            style={{ color: "#100D26" }}
          >
            Control Center
          </h2>
        </div>

        {/* Main screen area */}
        <div className="relative rounded-2xl border-2 border-[hsl(0,3%,36%)] overflow-hidden">
          {/* Dark green CRT-style screen */}
          <div
            className="p-6 sm:p-10 md:p-14 space-y-6 sm:space-y-8"
            style={{
              background: "radial-gradient(ellipse at center, #024a02 0%, #013201 50%, #001a00 100%)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), inset 0 0 120px rgba(0,50,0,0.15)",
            }}
          >
            {featuredPaths.map((path) => {
              const isOn = subscribedIds.has(path.id);
              const progress = pathProgress.get(path.id);
              const label = QUEST_LABELS[path.slug] ?? path.title.toUpperCase();

              return (
                <QuestButton
                  key={path.id}
                  label={label}
                  isOn={isOn}
                  progress={progress}
                  onClick={() => handleClick(path)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

/** A single quest toggle-button row */
function QuestButton({
  label,
  isOn,
  progress,
  onClick,
}: {
  label: string;
  isOn: boolean;
  progress?: { completed: number; total: number };
  onClick: () => void;
}) {
  const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md transition-transform active:scale-[0.98]"
      aria-label={`${label} — ${isOn ? `active, ${pct}% complete` : "not started"}`}
    >
      <div className="relative">
        {/* Button body */}
        <div
          className="relative px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between rounded-md border transition-shadow"
          style={
            isOn
              ? {
                  background: "#01FF85",
                  borderColor: "#01FF85",
                  boxShadow:
                    "0 0 4px rgba(50,156,43,1), 0 0 8px rgba(50,156,43,1), 0 0 28px rgba(50,156,43,0.7), 0 0 56px rgba(50,156,43,0.5), 0 0 96px rgba(50,156,43,0.3)",
                }
              : {
                  background: "#F0F0DF",
                  borderColor: "#F1F1D2",
                  boxShadow:
                    "0 0 4px rgba(159,142,142,0.6), 0 0 8px rgba(159,142,142,0.4), 0 0 28px rgba(159,142,142,0.2)",
                }
          }
        >
          <span
            className="text-sm sm:text-base md:text-lg font-bold tracking-wider select-none"
            style={{ color: isOn ? "#013201" : "#5B5151" }}
          >
            {label}
          </span>
          {isOn && progress && (
            <span
              className="text-xs sm:text-sm font-semibold tabular-nums"
              style={{ color: "#013201" }}
            >
              {pct}%
            </span>
          )}
        </div>
        {/* 3D bottom edge */}
        <div
          className="h-2 rounded-b-md -mt-px"
          style={{ background: isOn ? "#0D6A08" : "#80823A" }}
        />
      </div>
    </button>
  );
}

/** Decorative screw graphic */
function Screw({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="relative h-8 w-8 sm:h-10 sm:w-10">
        <div className="absolute inset-0 rounded-full bg-[hsl(0,3%,65%)]" />
        <div className="absolute inset-[3px] sm:inset-1 rounded-full bg-[hsl(240,40%,10%)]" />
        {/* Cross pattern */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[60%] h-[2px] bg-[hsl(205,15%,65%)] rotate-45 absolute" />
          <div className="w-[60%] h-[2px] bg-[hsl(205,15%,65%)] -rotate-45 absolute" />
        </div>
      </div>
    </div>
  );
}
