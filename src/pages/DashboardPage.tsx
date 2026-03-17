import { useEffect, useState } from "react";
import { JourneyStepCard, type JourneyStep } from "@/components/JourneyStepCard";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { BarChart3, Clock, Trophy, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { JourneyService } from "@/services/journey.service";
import { NetworkActivity } from "@/components/NetworkActivity";
import { StatsService } from "@/services/stats.service";
import { TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import { Link } from "react-router-dom";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [firstStepsCompleted, setFirstStepsCompleted] = useState<number | null>(null);
  const [secondStepsCompleted, setSecondStepsCompleted] = useState<number | null>(null);
  const [thirdStepsCompleted, setThirdStepsCompleted] = useState<number | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [communityBadgeCount, setCommunityBadgeCount] = useState<number | null>(null);
  const totalFirstSteps = 6;


  useEffect(() => {
    if (!user) return;
    Promise.all([
      JourneyService.getCompletedCount(user.id, "first_steps"),
      JourneyService.getCompletedCount(user.id, "second_steps"),
      JourneyService.getCompletedCount(user.id, "third_steps"),
      StatsService.getNetworkStats(),
    ]).then(([first, second, third, stats]) => {
      setFirstStepsCompleted(first);
      setSecondStepsCompleted(second);
      setThirdStepsCompleted(third);
      setCommunityBadgeCount(
        (stats.first_steps_completed ?? 0) + (stats.second_steps_completed ?? 0)
      );
    });
  }, [user]);

  const allFirstStepsDone = firstStepsCompleted !== null && firstStepsCompleted >= totalFirstSteps;
  const allSecondStepsDone = secondStepsCompleted !== null && secondStepsCompleted >= TOTAL_AGILE_LESSONS;
  const allThirdStepsDone = thirdStepsCompleted !== null && thirdStepsCompleted >= TOTAL_TEAMWORK_LESSONS;

  // No auto-redirect — always show the dashboard overview on login

  const currentPhase = allThirdStepsDone
    ? "Learn the Team Practices"
    : allSecondStepsDone
    ? "Learn About Agile Teamwork"
    : allFirstStepsDone
    ? "Build an Agile Mindset"
    : "Onboarding Steps";

  const totalCompleted = (firstStepsCompleted ?? 0) + (secondStepsCompleted ?? 0) + (thirdStepsCompleted ?? 0);
  const totalTasks = totalFirstSteps + TOTAL_AGILE_LESSONS + TOTAL_TEAMWORK_LESSONS;
  const badgesEarned = (allFirstStepsDone ? 1 : 0) + (allSecondStepsDone ? 1 : 0) + (allThirdStepsDone ? 1 : 0);

  const journeySteps: JourneyStep[] = allFirstStepsDone
    ? [
        { id: "second-steps", title: "Build an Agile Mindset", description: `Complete the Agile Handbook course: ${secondStepsCompleted ?? 0}/${TOTAL_AGILE_LESSONS} lessons completed.`, status: allSecondStepsDone ? "completed" : "current", href: "/journey/second-steps" },
        { id: "third-steps", title: "Learn About Agile Teamwork", description: "Read the Teammate Handbook and pass the comprehension quiz.", status: allSecondStepsDone ? "current" : "locked", href: "/journey/third-steps" },
        { id: "team-practices", title: "Learn the Team Practices of Empowered Teams", description: "Master the practices that make agile teams effective and self-organizing.", status: "locked", href: "/journey/third-steps" },
      ]
    : [
        { id: "first-steps", title: "Onboarding Steps", description: "Set up your profile, complete onboarding class, sign up for service leadership, and review the user guide.", status: "current", href: "/journey/first-steps" },
      ];

  const allStepsCompleted = journeySteps.every((s) => s.status === "completed");

  const displayName = profile?.first_name || profile?.display_name || user?.user_metadata?.full_name || "there";

  const journeyHeading = allFirstStepsDone ? "Recommended Courses" : "Get Started in Tech Fleet";

  const journeySection = (
    <section aria-labelledby="journey-heading">
      <h2 id="journey-heading" className="text-xl font-semibold text-foreground mb-4">{journeyHeading}</h2>

      {allStepsCompleted ? (
        <div className="space-y-3">
          <div className="card-elevated border-success/50 bg-success/5 p-5">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="h-8 w-8 text-success flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-foreground">🎉 All Courses Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  You've completed every recommended course. Congratulations!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowAllSteps(!showAllSteps)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              {showAllSteps ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {showAllSteps ? "Hide completed courses" : "Show completed courses"}
            </button>
          </div>

          {showAllSteps && (
            <div className="space-y-2 animate-fade-in">
              {journeySteps.map((step) => (
                <Link
                  key={step.id}
                  to={step.href}
                  className="flex items-center gap-3 p-3 rounded-lg border border-success/20 bg-success/5 hover:bg-success/10 transition-colors"
                >
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground">{step.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {journeySteps.map((step, index) => (
            <div key={step.id}>
              <JourneyStepCard step={step} index={index} />
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const badgesSection = (
    <section className="mb-8">
      <BadgesDisplay allFirstStepsDone={allFirstStepsDone} allSecondStepsDone={allSecondStepsDone} communityBadgeCount={communityBadgeCount} />
    </section>
  );

  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Welcome back, {displayName} 👋</h1>
        <p className="text-muted-foreground mt-1">Continue your journey through the Tech Fleet training platform.</p>
      </div>

      {allFirstStepsDone ? (
        <>
          {badgesSection}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { label: "Current Phase", value: currentPhase, icon: Clock, color: "text-primary" },
              { label: "Tasks Completed", value: `${totalCompleted} / ${totalTasks}`, icon: BarChart3, color: "text-warning" },
              { label: "Badges Earned", value: String(badgesEarned), icon: Trophy, color: "text-success" },
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

          {journeySection}
        </>
      ) : (
        <>
          {journeySection}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-8">
            {[
              { label: "Current Phase", value: currentPhase, icon: Clock, color: "text-primary" },
              { label: "Tasks Completed", value: `${totalCompleted} / ${totalTasks}`, icon: BarChart3, color: "text-warning" },
              { label: "Badges Earned", value: String(badgesEarned), icon: Trophy, color: "text-success" },
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

          {badgesSection}
        </>
      )}

      <section className="mt-10 border-t pt-8">
        <NetworkActivity />
      </section>
    </div>
  );
}
