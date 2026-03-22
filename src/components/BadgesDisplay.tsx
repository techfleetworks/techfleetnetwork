import { Link } from "react-router-dom";
import badgeFirstSteps from "@/assets/badge-first-steps.png";
import badgeSecondSteps from "@/assets/badge-second-steps.png";
import badgeDiscordLearning from "@/assets/badge-discord-learning.png";
import badgeThirdSteps from "@/assets/badge-third-steps.png";
import badgeProjectTraining from "@/assets/badge-project-training.png";
import badgeVolunteer from "@/assets/badge-volunteer.png";

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
  allDiscordDone?: boolean;
  allThirdStepsDone?: boolean;
  allProjectTrainingDone?: boolean;
  allVolunteerDone?: boolean;
  communityBadgeCount?: number | null;
}

export function BadgesDisplay({
  allFirstStepsDone,
  allSecondStepsDone,
  allDiscordDone = false,
  allThirdStepsDone = false,
  allProjectTrainingDone = false,
  allVolunteerDone = false,
  communityBadgeCount,
}: BadgesDisplayProps) {
  const badges: Badge[] = [
    {
      id: "first-steps",
      name: "Onboarding",
      description: "Completed onboarding checklist",
      image: badgeFirstSteps,
      earned: allFirstStepsDone,
      href: "/courses/onboarding",
    },
    {
      id: "agile-mindset",
      name: "Agile Mindset",
      description: "Completed all Agile lessons",
      image: badgeSecondSteps,
      earned: allSecondStepsDone,
      href: "/courses/agile-mindset",
    },
    {
      id: "discord-learning",
      name: "Discord Learning",
      description: "Completed Discord Learning Series",
      image: badgeDiscordLearning,
      earned: allDiscordDone,
      href: "/courses/discord-learning",
    },
    {
      id: "cross-functional",
      name: "Cross-Functional",
      description: "Completed Agile Cross-Functional Team Dynamics",
      image: badgeThirdSteps,
      earned: allThirdStepsDone,
      href: "/courses/agile-teamwork",
    },
    {
      id: "project-training",
      name: "Project Training",
      description: "Completed Join Project Training Teams",
      image: badgeProjectTraining,
      earned: allProjectTrainingDone,
      href: "/courses/project-training",
    },
    {
      id: "volunteer",
      name: "Volunteer",
      description: "Completed Join Volunteer Teams",
      image: badgeVolunteer,
      earned: allVolunteerDone,
      href: "/courses/volunteer-teams",
    },
  ];

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <section aria-labelledby="badges-heading">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 id="badges-heading" className="text-xl font-semibold text-foreground">
            Core Badges Earned
          </h2>
          <span className="text-sm text-muted-foreground">
            ({earnedCount}/{badges.length})
          </span>
        </div>
        {communityBadgeCount != null && (
          <p className="mt-1 text-sm text-muted-foreground">
            🏆 <span className="font-semibold text-foreground">{communityBadgeCount.toLocaleString()}</span>{" "}
            {communityBadgeCount === 1 ? "badge" : "badges"} earned across all Tech Fleet members
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {badges.map((badge) => (
          <Link
            key={badge.id}
            to={badge.href}
            className="flex flex-col items-center text-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-2 transition-colors hover:bg-muted/50"
            aria-label={`${badge.name} badge – ${badge.earned ? badge.description : "Click to Continue"}`}
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
              {badge.earned ? badge.description : "Click to Continue"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
