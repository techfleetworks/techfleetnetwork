import { Link } from "react-router-dom";
import badgeFirstSteps from "@/assets/badge-first-steps.png";
import badgeSecondSteps from "@/assets/badge-second-steps.png";
import badgeThirdSteps from "@/assets/badge-third-steps.png";
import badgeObserver from "@/assets/badge-observer.png";

interface Badge {
  id: string;
  name: string;
  description: string;
  image: string;
  earned: boolean;
  href: string;
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
      name: "Onboarding",
      description: "Completed onboarding checklist",
      image: badgeFirstSteps,
      earned: allFirstStepsDone,
      href: "/journey/first-steps",
    },
    {
      id: "agile-mindset",
      name: "Agile Mindset",
      description: "Completed all 25 Agile lessons",
      image: badgeSecondSteps,
      earned: allSecondStepsDone,
      href: "/journey/second-steps",
    },
    {
      id: "teammate",
      name: "Teammate",
      description: "Completed the Teammate Handbook",
      image: badgeThirdSteps,
      earned: false,
      href: "/journey/third-steps",
    },
    {
      id: "observer",
      name: "Observer",
      description: "Completed Observe Project Teams",
      image: badgeObserver,
      earned: false,
      href: "/journey/observer",
    },
  ];

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <section aria-labelledby="badges-heading">
      <div className="flex items-center gap-2 mb-4">
        <h2 id="badges-heading" className="text-xl font-semibold text-foreground">
          Beginner Badges Earned
        </h2>
        <span className="text-sm text-muted-foreground">
          ({earnedCount}/{badges.length})
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {badges.map((badge) => (
          <Link
            key={badge.id}
            to={badge.href}
            className="flex flex-col items-center text-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-2 transition-colors hover:bg-muted/50"
            aria-label={`${badge.name} badge – ${badge.earned ? badge.description : "Locked"}`}
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
          </Link>
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
