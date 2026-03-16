import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Play, BookOpen, Users, User, ArrowLeft, ExternalLink, Figma, ScrollText, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { JourneyService } from "@/services/journey.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { toast } from "sonner";
import { CommunityAgreementPanel } from "@/components/CommunityAgreementPanel";

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  icon: React.ElementType;
  action: string;
  external?: boolean;
  panelAction?: boolean;
}

const baseTasks: Omit<Task, "completed">[] = [
  {
    id: "profile",
    title: "Set Up Profile",
    description: "Fill in your name, country, and activity interests.",
    icon: User,
    action: "/profile-setup",
  },
  {
    id: "onboarding-class",
    title: "Complete Onboarding Class",
    description: "Register for and attend the Tech Fleet onboarding session.",
    icon: Play,
    action: "https://techfleet.org/onboarding",
    external: true,
  },
  {
    id: "service-leadership",
    title: "Sign Up for Service Leadership Class",
    description: "Register for the next available service leadership session.",
    icon: Users,
    action: "https://techfleet.org/overview/current-classes",
    external: true,
  },
  {
    id: "user-guide",
    title: "Complete the Discord Tutorial Series in the User Guide",
    description: "Work through the Discord migration video tutorial series.",
    icon: BookOpen,
    action: "https://guide.techfleet.org/resources/the-great-tech-fleet-discord-migration-video-tutorials",
    external: true,
  },
  {
    id: "figma-account",
    title: "Register for Figma Educational Account",
    description: "Join the Tech Fleet Figma educational workspace.",
    icon: Figma,
    action: "https://guide.techfleet.org/resources/join-the-tech-fleet-figma-educational-space",
    external: true,
  },
  {
    id: "community-agreement",
    title: "Agree to the Community Member Agreement",
    description: "Read and accept the Tech Fleet Community Collective Agreement.",
    icon: ScrollText,
    action: "#",
    panelAction: true,
  },
];

const joinDiscordTask: Omit<Task, "completed"> = {
  id: "join-discord",
  title: "Join Tech Fleet Discord",
  description: "Sign up for the Tech Fleet Discord community at techfleet.org/join.",
  icon: MessageSquare,
  action: "https://techfleet.org/join",
  external: true,
};

export default function FirstStepsPage() {
  const { user, profile } = useAuth();

  // Build task list: include "join-discord" only if user has no discord username
  const taskDefs = (() => {
    const hasDiscord = profile?.discord_username && profile.discord_username.trim() !== "";
    if (hasDiscord) return baseTasks;
    // Insert join-discord after profile task
    const idx = baseTasks.findIndex((t) => t.id === "profile");
    const copy = [...baseTasks];
    copy.splice(idx + 1, 0, joinDiscordTask);
    return copy;
  })();

  const [tasks, setTasks] = useState<Task[]>(taskDefs.map((t) => ({ ...t, completed: false })));
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [visitedExternal, setVisitedExternal] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem("first_steps_visited");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [agreementOpen, setAgreementOpen] = useState(false);

  // Re-build tasks when profile changes (e.g. discord added)
  useEffect(() => {
    setTasks((prev) => {
      const prevMap = new Map(prev.map((t) => [t.id, t.completed]));
      return taskDefs.map((t) => ({ ...t, completed: prevMap.get(t.id) || false }));
    });
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    JourneyService.getProgress(user.id, "first_steps").then((progress) => {
      const completedMap = new Map(progress.map((d) => [d.task_id, d.completed]));
      setTasks((prev) => prev.map((t) => ({ ...t, completed: completedMap.get(t.id) || false })));
    });
  }, [user]);

  const getDisplayName = () =>
    profile?.display_name || profile?.first_name || user?.user_metadata?.full_name || "A member";
  const getDiscordUsername = () => profile?.discord_username || undefined;
  const getDiscordUserId = () => profile?.discord_user_id || undefined;

  const handleExternalVisit = (id: string, url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setVisitedExternal((prev) => {
      const next = new Set(prev).add(id);
      try { sessionStorage.setItem("first_steps_visited", JSON.stringify([...next])); } catch {}
      return next;
    });

    // Notify Discord for class registration actions
    const name = getDisplayName();
    const discord = getDiscordUsername();
    const discordId = getDiscordUserId();
    if (id === "onboarding-class") {
      DiscordNotifyService.classRegistered(name, "Onboarding Class", discord, discordId);
    } else if (id === "service-leadership") {
      DiscordNotifyService.classRegistered(name, "Service Leadership Class", discord, discordId);
    }
  };

  const toggleTask = async (id: string) => {
    if (!user) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    // For external tasks, require visiting the link first before marking complete
    if (task.external && !task.completed && !visitedExternal.has(id)) return;

    const newCompleted = !task.completed;
    setLoadingId(id);

    try {
      await JourneyService.upsertTask(user.id, "first_steps", id, newCompleted);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: newCompleted } : t)));

      if (newCompleted) {
        const name = getDisplayName();
        const discord = getDiscordUsername();
        const discordId = getDiscordUserId();
        DiscordNotifyService.taskCompleted(name, id, discord, discordId);

        // Check if all tasks are now complete
        const newCompletedCount = tasks.filter((t) => t.id !== id ? t.completed : true).length;
        if (newCompletedCount === tasks.length) {
          DiscordNotifyService.phaseCompleted(name, "first_steps", discord, discordId);
        }
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleAgreementAccepted = async () => {
    if (!user) return;
    setLoadingId("community-agreement");
    try {
      await JourneyService.upsertTask(user.id, "first_steps", "community-agreement", true);
      setTasks((prev) =>
        prev.map((t) => (t.id === "community-agreement" ? { ...t, completed: true } : t))
      );

      const name = getDisplayName();
      const discord = getDiscordUsername();
      const discordId = getDiscordUserId();
      DiscordNotifyService.taskCompleted(name, "community-agreement", discord, discordId);

      // Check if all tasks are now complete
      const newCompletedCount = tasks.filter((t) => t.id !== "community-agreement" ? t.completed : true).length;
      if (newCompletedCount === tasks.length) {
        DiscordNotifyService.phaseCompleted(name, "first_steps", discord, discordId);
      }
    } finally {
      setLoadingId(null);
      setAgreementOpen(false);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const allComplete = completedCount === tasks.length;
  const progress = (completedCount / tasks.length) * 100;

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl">
      <Link to="/dashboard?view=overview" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">First Steps</h1>
        <p className="text-muted-foreground mt-1">Complete all {tasks.length} tasks below to unlock Second Steps. You can do them in any order.</p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">{completedCount} of {tasks.length} tasks completed</span>
          <span className="font-medium text-foreground">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="First Steps progress">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => {
          const Icon = task.icon;
          const isExternalNotVisited = task.external && !task.completed && !visitedExternal.has(task.id);

          return (
            <div key={task.id} className={`card-elevated p-5 transition-all duration-200 ${task.completed ? "border-success/30 bg-success/5" : ""}`}>
              <div className="flex items-start gap-4">
                {/* Completion toggle */}
                <button
                  onClick={() => toggleTask(task.id)}
                  className="flex-shrink-0 mt-0.5"
                  disabled={loadingId === task.id || task.panelAction || isExternalNotVisited}
                  title={
                    task.panelAction
                      ? "Use the agreement panel to complete this"
                      : isExternalNotVisited
                      ? "Visit the link first, then mark complete"
                      : `Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`
                  }
                  aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
                >
                  {task.completed ? (
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  ) : (
                    <Circle className={`h-6 w-6 ${isExternalNotVisited || task.panelAction ? "text-muted-foreground/40" : "text-muted-foreground hover:text-primary"} transition-colors`} />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold ${task.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {task.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{task.description}</p>
                  {task.external && visitedExternal.has(task.id) && !task.completed && (
                    <p className="text-xs text-primary mt-1">✓ Link visited — you can now mark this as complete</p>
                  )}
                </div>

                {/* Action button */}
                {task.panelAction ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={task.completed}
                    onClick={() => setAgreementOpen(true)}
                  >
                    <Icon className="h-4 w-4 mr-1" />
                    Review
                  </Button>
                ) : task.external ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={task.completed}
                    onClick={() => handleExternalVisit(task.id, task.action)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open
                  </Button>
                ) : (
                  <Link to={task.action}>
                    <Button variant="outline" size="sm" disabled={task.completed}>
                      <Icon className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {allComplete && (
        <div className="mt-8 card-elevated border-success/50 bg-success/5 p-6 text-center animate-fade-in">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h2 className="text-xl font-bold text-foreground mb-2">🎉 First Steps Complete!</h2>
          <p className="text-muted-foreground mb-4">You've unlocked the Second Steps phase.</p>
          <Link to="/journey/second-steps"><Button>Continue to Second Steps</Button></Link>
        </div>
      )}

      <CommunityAgreementPanel
        open={agreementOpen}
        onOpenChange={setAgreementOpen}
        onAccepted={handleAgreementAccepted}
        loading={loadingId === "community-agreement"}
      />
    </div>
  );
}
