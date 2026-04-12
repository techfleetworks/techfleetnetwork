import { useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useQuestPaths,
  useAllQuestSteps,
  useUserQuestSelections,
  useSelfReportProgress,
  useAllJourneyProgress,
  useQuestSteps,
  useAddQuestPath,
} from "@/hooks/use-quest";
import { isStepCompleted } from "./QuestRoadmap";
import { DosTypewriter } from "./DosTypewriter";
import { toast } from "sonner";
import type { QuestPath, QuestPathStep } from "@/services/quest.service";

const FEATURED_SLUGS = ["client-projects", "learn-skills", "volunteer"] as const;

const QUEST_LABELS: Record<string, string> = {
  "client-projects": "GET REAL AGILE TEAM EXPERIENCE",
  "learn-skills": "TAKE CLASSES",
  volunteer: "VOLUNTEER",
};

const STEP_TYPE_LABELS: Record<string, string> = {
  course: "COURSE",
  self_report: "SELF-REPORT",
  system_verified: "VERIFIED",
  application: "APPLICATION",
};

type ScreenView = "home" | "quest-detail";

export function ControlCenterOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: paths, isLoading: pathsLoading } = useQuestPaths();
  const { data: allSteps } = useAllQuestSteps();
  const { data: selections, isLoading: selectionsLoading } = useUserQuestSelections();
  const { data: selfReportProgress } = useSelfReportProgress();
  const { data: allJourneyMap } = useAllJourneyProgress();

  const [screenView, setScreenView] = useState<ScreenView>("home");
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

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

  const handleQuestClick = useCallback(
    (path: QuestPath) => {
      if (subscribedIds.has(path.id)) {
        navigate(`/my-journey/quest/${path.id}`);
      } else {
        setSelectedQuestId(path.id);
        setScreenView("quest-detail");
      }
    },
    [subscribedIds, navigate]
  );

  const handleReturnHome = useCallback(() => {
    setScreenView("home");
    setSelectedQuestId(null);
  }, []);

  if (pathsLoading || selectionsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading control center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto" role="region" aria-label="Quest Control Center">
      {/* TV Frame using the SVG as background */}
      <div className="relative w-full" style={{ aspectRatio: "2826 / 2194" }}>
        {/* The TV frame SVG */}
        <img
          src="/images/quest-center-tv.svg"
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          aria-hidden="true"
          draggable={false}
        />

        {/* Screen content area - positioned over the CRT screen region */}
        <div
          className="absolute overflow-hidden"
          style={{
            top: "30.5%",
            left: "11.5%",
            width: "77%",
            height: "59%",
            borderRadius: "2%",
          }}
        >
          {/* CRT background */}
          <div
            className="w-full h-full relative"
            style={{
              background: "radial-gradient(ellipse at center, #024a02 0%, #013201 50%, #001a00 100%)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), inset 0 0 120px rgba(0,50,0,0.15)",
            }}
          >
            {/* Scanline overlay */}
            <div
              className="absolute inset-0 pointer-events-none z-10"
              aria-hidden="true"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
              }}
            />

            {/* Screen glow */}
            <div
              className="absolute inset-0 pointer-events-none z-10"
              aria-hidden="true"
              style={{
                background: "radial-gradient(ellipse at center, rgba(1,255,133,0.03) 0%, transparent 70%)",
              }}
            />

            {/* Content */}
            <div className="relative z-20 w-full h-full overflow-y-auto dos-scrollbar p-[6%]">
              {screenView === "home" ? (
                <HomeScreen
                  featuredPaths={featuredPaths}
                  subscribedIds={subscribedIds}
                  pathProgress={pathProgress}
                  onQuestClick={handleQuestClick}
                />
              ) : selectedQuestId ? (
                <QuestDetailScreen
                  pathId={selectedQuestId}
                  onReturn={handleReturnHome}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Home Screen ─────────────────────────────────── */

function HomeScreen({
  featuredPaths,
  subscribedIds,
  pathProgress,
  onQuestClick,
}: {
  featuredPaths: QuestPath[];
  subscribedIds: Set<string>;
  pathProgress: Map<string, { completed: number; total: number }>;
  onQuestClick: (path: QuestPath) => void;
}) {
  return (
    <div className="space-y-[4%] font-mono">
      <div className="text-center mb-[3%]">
        <h2
          className="text-[clamp(0.7rem,2.2vw,1.8rem)] font-bold tracking-[0.2em] uppercase"
          style={{ color: "#01FF85" }}
        >
          <DosTypewriter text="CONTROL CENTER" speed={60} />
        </h2>
        <p
          className="text-[clamp(0.4rem,1vw,0.75rem)] mt-[1%] tracking-wider"
          style={{ color: "#01FF85", opacity: 0.6 }}
        >
          <DosTypewriter text="SELECT A QUEST TO BEGIN" speed={40} instant={false} />
        </p>
      </div>

      {featuredPaths.map((path) => {
        const isOn = subscribedIds.has(path.id);
        const progress = pathProgress.get(path.id);
        const label = QUEST_LABELS[path.slug] ?? path.title.toUpperCase();
        const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

        return (
          <button
            key={path.id}
            onClick={() => onQuestClick(path)}
            className="w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md transition-transform active:scale-[0.98]"
            aria-label={`${label} — ${isOn ? `active, ${pct}% complete` : "not started"}`}
          >
            <div className="relative">
              <div
                className="relative px-[4%] py-[3%] flex items-center justify-between rounded-md border transition-shadow"
                style={
                  isOn
                    ? {
                        background: "#01FF85",
                        borderColor: "#01FF85",
                        boxShadow: "0 0 4px rgba(50,156,43,1), 0 0 8px rgba(50,156,43,1), 0 0 28px rgba(50,156,43,0.7), 0 0 56px rgba(50,156,43,0.5)",
                      }
                    : {
                        background: "#F0F0DF",
                        borderColor: "#F1F1D2",
                        boxShadow: "0 0 4px rgba(159,142,142,0.6), 0 0 8px rgba(159,142,142,0.4)",
                      }
                }
              >
                <span
                  className="text-[clamp(0.5rem,1.5vw,1.1rem)] font-bold tracking-wider select-none font-mono"
                  style={{ color: isOn ? "#013201" : "#5B5151" }}
                >
                  {label}
                </span>
                {isOn && progress && (
                  <span
                    className="text-[clamp(0.4rem,1.2vw,0.9rem)] font-semibold tabular-nums font-mono"
                    style={{ color: "#013201" }}
                  >
                    {pct}%
                  </span>
                )}
              </div>
              <div
                className="h-[clamp(3px,0.4vw,8px)] rounded-b-md -mt-px"
                style={{ background: isOn ? "#0D6A08" : "#80823A" }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Quest Detail Screen ──────────────────────────── */

function QuestDetailScreen({
  pathId,
  onReturn,
}: {
  pathId: string;
  onReturn: () => void;
}) {
  const { data: paths } = useQuestPaths();
  const { data: steps, isLoading: stepsLoading } = useQuestSteps(pathId);
  const addPath = useAddQuestPath();

  const path = paths?.find((p) => p.id === pathId);

  const handleSubscribe = async () => {
    try {
      await addPath.mutateAsync(pathId);
      toast.success(`Quest "${path?.title}" activated!`);
      onReturn();
    } catch {
      // error handled by hook
    }
  };

  if (!path) return null;

  const lines = [
    `> LOADING QUEST: ${path.title.toUpperCase()}`,
    "",
    `DESCRIPTION:`,
    path.description,
    "",
    `LEVEL: ${(path.level || "beginner").toUpperCase()}`,
    `ESTIMATED DURATION: ${path.estimated_duration}`,
    "",
  ];

  const stepsText = steps
    ? steps.map(
        (step, i) =>
          `  ${String(i + 1).padStart(2, "0")}. [${STEP_TYPE_LABELS[step.step_type] ?? "STEP"}] ${step.title}`
      )
    : [];

  const fullText = [...lines, "STEPS:", ...stepsText, "", "> READY TO BEGIN? [Y/N]"].join("\n");

  return (
    <div className="font-mono space-y-[3%]">
      {/* Back button */}
      <button
        onClick={onReturn}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        style={{ color: "#01FF85" }}
      >
        <span className="text-[clamp(0.4rem,1vw,0.75rem)] tracking-wider hover:underline">
          {"< RETURN HOME"}
        </span>
      </button>

      {/* Terminal content */}
      <pre
        className="whitespace-pre-wrap text-[clamp(0.35rem,1vw,0.75rem)] leading-relaxed"
        style={{ color: "#01FF85" }}
      >
        {stepsLoading ? (
          <DosTypewriter text="> LOADING QUEST DATA..." speed={40} />
        ) : (
          <DosTypewriter text={fullText} speed={8} />
        )}
      </pre>

      {/* Action buttons */}
      {!stepsLoading && (
        <div className="flex gap-[3%] pt-[2%]">
          <button
            onClick={handleSubscribe}
            disabled={addPath.isPending}
            className="px-[4%] py-[2%] rounded border font-bold text-[clamp(0.4rem,1.1vw,0.8rem)] tracking-wider transition-all hover:shadow-[0_0_12px_rgba(1,255,133,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            style={{
              color: "#013201",
              background: "#01FF85",
              borderColor: "#01FF85",
            }}
          >
            {addPath.isPending ? "ACTIVATING..." : "Y - START QUEST"}
          </button>
          <button
            onClick={onReturn}
            className="px-[4%] py-[2%] rounded border font-bold text-[clamp(0.4rem,1.1vw,0.8rem)] tracking-wider transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              color: "#01FF85",
              background: "transparent",
              borderColor: "#01FF85",
            }}
          >
            N - GO BACK
          </button>
        </div>
      )}
    </div>
  );
}
