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

/* ── Static button definitions matching the Figma design ── */
const QUEST_BUTTONS = [
  { slug: "plan-journey", label: "PLAN JOURNEY" },
  { slug: "explore-possibilities", label: "EXPLORE POSSIBILITIES" },
  { slug: "observe-teams", label: "OBSERVE TEAMS" },
  { slug: "client-projects", label: "GET TEAM EXPERIENCE" },
  { slug: "learn-skills", label: "DEVELOP SKILLS" },
] as const;

const STEP_TYPE_LABELS: Record<string, string> = {
  course: "COURSE",
  self_report: "SELF-REPORT",
  system_verified: "VERIFIED",
  application: "APPLICATION",
};

/*
 * Button Y positions within the right panel (577×990 local coords),
 * derived from control-center.svg element positions.
 *   button rect top = (svgY - panelTop) / panelHeight
 *   panelTop = 329, panelHeight = 990
 */
const BUTTON_TOPS = [18.28, 31.31, 44.44, 57.58, 70.71]; // %

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

  const subscribedIds = useMemo(() => {
    if (!selections) return new Set<string>();
    return new Set(selections.map((s) => s.path_id));
  }, [selections]);

  /** Resolve slug → QuestPath (if it exists in DB) */
  const pathBySlug = useMemo(() => {
    const map = new Map<string, QuestPath>();
    if (!paths) return map;
    for (const p of paths) map.set(p.slug, p);
    return map;
  }, [paths]);

  const handleQuestClick = useCallback(
    (slug: string) => {
      const path = pathBySlug.get(slug);
      if (!path) return;
      if (subscribedIds.has(path.id)) {
        navigate(`/my-journey/quest/${path.id}`);
      } else {
        setSelectedQuestId(path.id);
        setScreenView("quest-detail");
      }
    },
    [pathBySlug, subscribedIds, navigate]
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
    <div className="w-full max-w-6xl mx-auto" role="region" aria-label="Quest Control Center">
      {/* Full Control Center layout — background SVG */}
      <div className="relative w-full" style={{ aspectRatio: "2826 / 2194" }}>
        <img
          src="/images/control-center.svg"
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          aria-hidden="true"
          draggable={false}
        />

        {/* ── Screen content area — over the CRT green region ── */}
        <div
          className="absolute overflow-hidden"
          style={{
            top: "31.5%",
            left: "14%",
            width: "51.5%",
            height: "46.5%",
            borderRadius: "3% / 5%",
          }}
        >
          {screenView === "home" ? (
            <div className="w-full h-full relative">
              <img
                src="/images/landscape.svg"
                alt="Quest landscape"
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
                }}
              />
            </div>
          ) : selectedQuestId ? (
            <div
              className="w-full h-full relative"
              style={{
                background: "radial-gradient(ellipse at center, #024a02 0%, #013201 50%, #001a00 100%)",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none z-10"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none z-10"
                aria-hidden="true"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(1,255,133,0.04) 0%, transparent 70%)",
                }}
              />
              <div className="relative z-20 w-full h-full overflow-y-auto dos-scrollbar p-[6%]">
                <QuestDetailScreen pathId={selectedQuestId} onReturn={handleReturnHome} />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Right panel — built from SVG parts ── */}
        <div
          className="absolute"
          style={{
            /* Panel bounds in 2826×2194: x=2179 y=329, w=577 h=990 */
            left: "77.1%",
            top: "15%",
            width: "20.42%",
            height: "45.12%",
          }}
        >
          {/* Panel background */}
          <img
            src="/images/controls-bg.svg"
            alt=""
            className="absolute inset-0 w-full h-full pointer-events-none select-none"
            aria-hidden="true"
            draggable={false}
          />

          {/* Top screws — centered at y≈6.9% */}
          <div
            className="absolute pointer-events-none select-none"
            aria-hidden="true"
            style={{
              top: "3.3%",
              left: "4.3%",
              width: "91.3%", /* 532/583 */
              height: "7.5%", /* 74/990 */
            }}
          >
            <img src="/images/screws.svg" alt="" className="w-full h-full" draggable={false} />
          </div>

          {/* "QUESTS" title */}
          <div
            className="absolute w-full flex justify-center"
            style={{ top: "12%", left: 0, right: 0 }}
          >
            <span
              className="font-bold tracking-[0.2em] uppercase select-none"
              style={{
                color: "#100D26",
                fontSize: "clamp(0.5rem, 1.2vw, 1.1rem)",
              }}
            >
              QUESTS
            </span>
          </div>

          {/* Quest buttons */}
          {QUEST_BUTTONS.map((btn, i) => {
            const path = pathBySlug.get(btn.slug);
            const isOn = path ? subscribedIds.has(path.id) : false;
            const progress = path ? pathProgress.get(path.id) : undefined;
            const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;
            const isAvailable = !!path;

            return (
              <button
                key={btn.slug}
                onClick={() => handleQuestClick(btn.slug)}
                disabled={!isAvailable}
                className="absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  left: "5%",
                  width: "90%",
                  top: `${BUTTON_TOPS[i]}%`,
                  height: "11.5%",
                }}
                aria-label={`${btn.label} — ${isOn ? `active, ${pct}% complete` : isAvailable ? "not started" : "coming soon"}`}
              >
                {/* Button SVG background */}
                <img
                  src={isOn ? "/images/on-button.svg" : "/images/off-button.svg"}
                  alt=""
                  className="absolute inset-0 w-full h-full pointer-events-none select-none"
                  aria-hidden="true"
                  draggable={false}
                />
                {/* Label text overlay */}
                <span
                  className="relative z-10 font-bold tracking-[0.15em] select-none font-mono flex items-center justify-center w-full"
                  style={{
                    color: isOn ? "#013201" : "#100D26",
                    fontSize: "clamp(0.4rem, 1vw, 0.85rem)",
                    marginTop: "-4%",
                    height: "100%",
                  }}
                >
                  {btn.label}
                  {isOn && progress ? ` — ${pct}%` : ""}
                </span>
              </button>
            );
          })}

          {/* Bottom screws — centered at y≈90.5% */}
          <div
            className="absolute pointer-events-none select-none"
            aria-hidden="true"
            style={{
              top: "87%",
              left: "4.3%",
              width: "91.3%",
              height: "7.5%",
            }}
          >
            <img src="/images/screws.svg" alt="" className="w-full h-full" draggable={false} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Quest Detail Screen (inside the CRT) ── */

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
      <button
        onClick={onReturn}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        style={{ color: "#01FF85" }}
      >
        <span className="text-[clamp(0.35rem,0.9vw,0.7rem)] tracking-wider hover:underline">
          {"< RETURN HOME"}
        </span>
      </button>

      <pre
        className="whitespace-pre-wrap leading-relaxed"
        style={{ color: "#01FF85", fontSize: "clamp(0.3rem, 0.85vw, 0.7rem)" }}
      >
        {stepsLoading ? (
          <DosTypewriter text="> LOADING QUEST DATA..." speed={40} />
        ) : (
          <DosTypewriter text={fullText} speed={8} />
        )}
      </pre>

      {!stepsLoading && (
        <div className="flex gap-[3%] pt-[2%]">
          <button
            onClick={handleSubscribe}
            disabled={addPath.isPending}
            className="px-[4%] py-[2%] rounded border font-bold tracking-wider transition-all hover:shadow-[0_0_12px_rgba(1,255,133,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            style={{
              color: "#013201",
              background: "#01FF85",
              borderColor: "#01FF85",
              fontSize: "clamp(0.3rem, 0.8vw, 0.65rem)",
            }}
          >
            {addPath.isPending ? "ACTIVATING..." : "Y - START QUEST"}
          </button>
          <button
            onClick={onReturn}
            className="px-[4%] py-[2%] rounded border font-bold tracking-wider transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              color: "#01FF85",
              background: "transparent",
              borderColor: "#01FF85",
              fontSize: "clamp(0.3rem, 0.8vw, 0.65rem)",
            }}
          >
            N - GO BACK
          </button>
        </div>
      )}
    </div>
  );
}
