import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

export interface RecommendationData {
  title: string;
  type: "course" | "template" | "user guide" | "project";
  description: string;
  reason: string;
  link?: string;
}

const TYPE_STYLES: Record<RecommendationData["type"], string> = {
  course: "bg-primary/10 text-primary border-primary/20",
  template: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  "user guide": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  project: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

export default function ExploreRecommendationCard({ title, type, description, reason, link }: RecommendationData) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col p-5 gap-3">
      {/* Category badge */}
      <Badge variant="outline" className={`w-fit text-xs capitalize ${TYPE_STYLES[type] ?? ""}`}>
        {type}
      </Badge>

      {/* Title as link or plain text */}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
      </div>

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
