import { ExternalLink, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface RecommendationData {
  title: string;
  type: "course" | "template" | "user guide" | "project" | "online";
  description: string;
  reason: string;
  link?: string;
}

export default function ExploreRecommendationCard({ title, type, description, reason, link }: RecommendationData) {
  const isOnline = type === "online";

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col p-5 gap-3">
      {/* Title + Online badge */}
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground leading-snug">{title}</h2>
        {isOnline && (
          <Badge variant="outline" className="shrink-0 gap-1 text-xs border-primary/40 text-primary">
            <Globe className="h-3 w-3" />
            Online
          </Badge>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Why we recommend - only for non-online */}
      {!isOnline && reason && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">🌟 Why We Recommend</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
        </div>
      )}

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
          {isOnline ? "Visit Source" : "Open Resource"}
        </a>
      )}
    </div>
  );
}
