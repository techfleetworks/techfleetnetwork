import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAddQuestPath, useQuestPaths } from "@/hooks/use-quest";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { QuestPath } from "@/services/quest.service";

const INTEREST_OPTIONS = [
  { id: "Train on project teams", label: "Train on project teams", description: "Join real client project teams" },
  { id: "Take classes", label: "Take classes", description: "Enroll in masterclasses and courses" },
  { id: "Get mentorship", label: "Get mentorship", description: "Learn from experienced practitioners" },
  { id: "Volunteer for Tech Fleet's nonprofit organization", label: "Volunteer for Tech Fleet", description: "Contribute to our nonprofit mission" },
  { id: "Join a community of practice", label: "Join a community of practice", description: "Connect with like-minded professionals" },
  { id: "exploring", label: "I'm not sure yet, still exploring", description: "Browse all paths and discover what excites you" },
];

// Map interests to recommended path slugs
const INTEREST_PATH_MAP: Record<string, string[]> = {
  "Train on project teams": ["plan", "observe", "service-leader", "agile-mindset", "client-projects"],
  "Take classes": ["plan", "learn-skills", "service-leader", "agile-mindset"],
  "Get mentorship": ["plan", "observe", "service-leader", "agile-mindset", "client-projects"],
  "Volunteer for Tech Fleet's nonprofit organization": ["plan", "learn-skills", "service-leader", "agile-mindset", "volunteer"],
  "Join a community of practice": ["plan", "service-leader", "measure-practices"],
  "exploring": [],
};

interface QuestIntakeWizardProps {
  onComplete: () => void;
}

export function QuestIntakeWizard({ onComplete }: QuestIntakeWizardProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { data: paths } = useQuestPaths();
  const addPath = useAddQuestPath();
  const [step, setStep] = useState<"interests" | "recommendations">("interests");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(profile?.interests ?? []);
  const [saving, setSaving] = useState(false);

  const toggleInterest = useCallback((id: string) => {
    setSelectedInterests((prev) => {
      if (id === "exploring") return prev.includes(id) ? prev.filter((i) => i !== id) : ["exploring"];
      const next = prev.filter((i) => i !== "exploring");
      return next.includes(id) ? next.filter((i) => i !== id) : [...next, id];
    });
  }, []);

  const recommendedSlugs = useMemo(() => {
    if (selectedInterests.includes("exploring")) return [];
    const slugs = new Set<string>();
    for (const interest of selectedInterests) {
      for (const slug of INTEREST_PATH_MAP[interest] ?? []) {
        slugs.add(slug);
      }
    }
    return Array.from(slugs);
  }, [selectedInterests]);

  const recommendedPaths = useMemo(() => {
    if (!paths) return [];
    if (selectedInterests.includes("exploring")) return paths;
    return paths.filter((p) => recommendedSlugs.includes(p.slug));
  }, [paths, recommendedSlugs, selectedInterests]);

  const handleContinue = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Save interests to profile
      await supabase.from("profiles").update({ interests: selectedInterests.filter((i) => i !== "exploring") }).eq("user_id", user.id);
      await refreshProfile();
      setStep("recommendations");
    } catch {
      toast.error("Failed to save interests");
    } finally {
      setSaving(false);
    }
  };

  const handleStartJourney = async () => {
    if (!paths) return;
    setSaving(true);
    try {
      // Always add "onboard" path
      const pathsToAdd = new Set(recommendedSlugs);
      pathsToAdd.add("onboard");
      
      for (const slug of pathsToAdd) {
        const path = paths.find((p) => p.slug === slug);
        if (path) {
          try {
            await addPath.mutateAsync(path.id);
          } catch {
            // Ignore duplicates
          }
        }
      }
      toast.success("Your journey has begun!");
      onComplete();
    } catch {
      toast.error("Failed to set up your journey");
    } finally {
      setSaving(false);
    }
  };

  if (step === "interests") {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <Sparkles className="h-10 w-10 text-primary mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">What do you want to do?</h2>
          <p className="text-muted-foreground">
            Select the activities that interest you most. We'll recommend a personalized learning path.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Activity interests">
          {INTEREST_OPTIONS.map((option) => {
            const isSelected = selectedInterests.includes(option.id);
            return (
              <button
                key={option.id}
                onClick={() => toggleInterest(option.id)}
                className={cn(
                  "card-elevated p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "hover:border-muted-foreground/30 hover:shadow-sm"
                )}
                aria-pressed={isSelected}
                role="option"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors",
                      isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{option.label}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button
            onClick={handleContinue}
            disabled={selectedInterests.length === 0 || saving}
            size="lg"
            className="min-w-[200px]"
          >
            {saving ? "Saving..." : "Continue"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Recommendations step
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">
          {selectedInterests.includes("exploring") ? "Explore These Paths" : "Your Recommended Paths"}
        </h2>
        <p className="text-muted-foreground">
          {selectedInterests.includes("exploring")
            ? "Explore these paths to find what excites you."
            : "Based on your interests, here's your personalized learning roadmap."}
        </p>
      </div>

      <div className="space-y-3">
        {recommendedPaths.map((path, index) => (
          <RecommendedPathCard key={path.id} path={path} index={index} allPaths={paths ?? []} />
        ))}
      </div>

      {recommendedPaths.length > 0 && (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Total estimated time: ~{getTotalWeeks(recommendedPaths)} weeks (paths can overlap)
          </p>
          <Button onClick={handleStartJourney} disabled={saving} size="lg" className="min-w-[200px]">
            {saving ? "Setting up..." : "Start Your Journey"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function RecommendedPathCard({ path, index, allPaths }: { path: QuestPath; index: number; allPaths: QuestPath[] }) {
  const prereqsMet = path.prerequisites.length === 0; // At intake, no prereqs are met yet
  const prereqNames = path.prerequisites
    .map((slug) => allPaths.find((p) => p.slug === slug)?.title ?? slug)
    .join(", ");

  return (
    <div
      className={cn(
        "card-elevated p-4 flex items-center gap-4",
        !prereqsMet && "opacity-60"
      )}
    >
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground truncate">{path.title}</h3>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
            prereqsMet ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          )}>
            {prereqsMet ? "Ready" : "Locked"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{path.description}</p>
        {!prereqsMet && (
          <p className="text-xs text-muted-foreground mt-1">Requires: {prereqNames}</p>
        )}
      </div>
      <span className="text-sm text-muted-foreground flex-shrink-0">{path.estimated_duration}</span>
    </div>
  );
}

function getTotalWeeks(paths: QuestPath[]): number {
  let total = 0;
  for (const p of paths) {
    const match = p.estimated_duration.match(/(\d+)/);
    if (match) total += parseInt(match[1], 10);
  }
  return total;
}
