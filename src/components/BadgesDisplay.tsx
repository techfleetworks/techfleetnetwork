import badgeFirstSteps from "@/assets/badge-first-steps.png";
import badgeSecondSteps from "@/assets/badge-second-steps.png";
import badgeThirdSteps from "@/assets/badge-third-steps.png";
import badgeObserver from "@/assets/badge-observer.png";
import badgeProjects from "@/assets/badge-projects.png";

interface Badge {
  id: string;
  name: string;
  description: string;
  image: string;
  earned: boolean;
}

interface BadgesDisplayProps {
  allFirstStepsDone: boolean;
  allSecondStepsDone: boolean;
  communityBadgeCount?: number | null;
}

export function BadgesDisplay({ allFirstStepsDone, allSecondStepsDone, communityBadgeCount }: BadgesDisplayProps) {
  const badges: Badge[] = [
    {
      id: "first-steps",
      name: "First Steps",
      description: "Completed onboarding checklist",
      image: badgeFirstSteps,
      earned: allFirstStepsDone,
    },
    {
      id: "agile-mindset",
      name: "Agile Mindset",
      description: "Completed all 25 Agile lessons",
      image: badgeSecondSteps,
      earned: allSecondStepsDone,
    },
    {
      id: "teammate",
      name: "Teammate",
      description: "Completed the Teammate Handbook",
      image: badgeThirdSteps,
      earned: false,
    },
    {
      id: "observer",
      name: "Observer",
      description: "Completed the Observer phase",
      image: badgeObserver,
      earned: false,
    },
    {
      id: "contributor",
      name: "Contributor",
      description: "Joined a real project team",
      image: badgeProjects,
      earned: false,
    },
  ];

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <section aria-labelledby="badges-heading">
      <div className="flex items-center gap-2 mb-4">
        <h2 id="badges-heading" className="text-xl font-semibold text-foreground">
          Badges Earned
        </h2>
        <span className="text-sm text-muted-foreground">
          ({earnedCount}/{badges.length})
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4">
        {badges.map((badge) => (
          <div
            key={badge.id}
            className="flex flex-col items-center text-center group"
          >
            <div
              className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full transition-all duration-300 ${
                badge.earned
                  ? "drop-shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
                  : "grayscale opacity-40"
              }`}
            >
              <img
                src={badge.image}
                alt={badge.name}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <p
              className={`mt-2 text-xs sm:text-sm font-medium leading-tight ${
                badge.earned ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {badge.name}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 leading-tight hidden sm:block">
              {badge.earned ? badge.description : "Locked"}
            </p>
          </div>
        ))}
      </div>

      {communityBadgeCount != null && (
        <p className="mt-4 text-sm text-muted-foreground text-center">
          🏆 <span className="font-semibold text-foreground">{communityBadgeCount.toLocaleString()}</span>{" "}
          {communityBadgeCount === 1 ? "badge" : "badges"} earned across all Tech Fleet members
        </p>
      )}
    </section>
  );
}
