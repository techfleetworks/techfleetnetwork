import { useEffect, useState } from "react";
import { JourneyStepCard, type JourneyStep } from "@/components/JourneyStepCard";
import { BarChart3, Clock, Trophy, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { JourneyService } from "@/services/journey.service";
import { NetworkActivity } from "@/components/NetworkActivity";
import { ProfileEditPanel } from "@/components/ProfileEditPanel";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [firstStepsCompleted, setFirstStepsCompleted] = useState(0);
  const totalFirstSteps = 6;

  useEffect(() => {
    if (!user) return;
    JourneyService.getCompletedCount(user.id, "first_steps").then(setFirstStepsCompleted);
  }, [user]);

  const allFirstStepsDone = firstStepsCompleted >= totalFirstSteps;

  const journeySteps: JourneyStep[] = [
    { id: "first-steps", title: "First Steps", description: "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.", status: allFirstStepsDone ? "completed" : "current", href: "/journey/first-steps" },
    { id: "second-steps", title: "Second Steps — Agile Handbook", description: "Read the Agile Handbook and pass the comprehension quiz.", status: allFirstStepsDone ? "current" : "locked", href: "/journey/second-steps" },
    { id: "third-steps", title: "Third Steps — Teammate Handbook", description: "Read the Teammate Handbook and pass the comprehension quiz.", status: "locked", href: "/journey/third-steps" },
    { id: "observer", title: "Observer Phase", description: "Complete a 2-week observation period with daily posts, meeting attendance, and reflections.", status: "locked", href: "/journey/observer" },
    { id: "projects", title: "Apply for Projects", description: "Join real teams and contribute to community projects.", status: "locked", href: "/projects" },
  ];

  const displayName = profile?.first_name || profile?.display_name || user?.user_metadata?.full_name || "there";

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Welcome back, {displayName} 👋</h1>
        <p className="text-muted-foreground mt-1">Continue your journey through the Tech Fleet training platform.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Current Phase", value: allFirstStepsDone ? "Second Steps" : "First Steps", icon: Clock, color: "text-primary" },
          { label: "Tasks Completed", value: `${firstStepsCompleted} / ${totalFirstSteps}`, icon: BarChart3, color: "text-warning" },
          { label: "Badges Earned", value: allFirstStepsDone ? "1" : "0", icon: Trophy, color: "text-success" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-elevated p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className={`h-5 w-5 ${color}`} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold text-foreground">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section aria-labelledby="journey-heading">
        <h2 id="journey-heading" className="text-xl font-semibold text-foreground mb-4">Your Member Journey</h2>
        <div className="space-y-3">
          {journeySteps.map((step, index) => (
            <JourneyStepCard key={step.id} step={step} index={index} />
          ))}
        </div>
      </section>

      <section className="mt-10 border-t pt-8">
        <NetworkActivity />
      </section>
    </div>
  );
}
