import { ExternalLink } from "lucide-react";

export interface RecommendationData {
  title: string;
  type: "course" | "template" | "user guide" | "project";
  description: string;
  reason: string;
  link?: string;
}

export default function ExploreRecommendationCard({ title, description, reason, link }: RecommendationData) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col p-5 gap-3">
      {/* Title */}
      <h2 className="text-sm font-semibold text-foreground leading-snug">{title}</h2>

      {/* Description */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Why we recommend */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">🌟 Why We Recommend</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
      </div>

      {/* Link */}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline pt-1"
          aria-label={`Open ${title}`}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          Open Resource
        </a>
      )}
    </div>
  );
}
