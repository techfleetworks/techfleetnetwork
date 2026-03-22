import { Sparkles, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ExploreRecommendationCard, { type RecommendationData } from "./ExploreRecommendationCard";

export interface WebSearchResult {
  title: string;
  description: string;
  url: string;
}

interface ExploreResultsSectionProps {
  query: string;
  recommendations: RecommendationData[];
  webResults?: WebSearchResult[];
}

export default function ExploreResultsSection({ query, recommendations, webResults = [] }: ExploreResultsSectionProps) {
  const hasRecs = recommendations.length > 0;
  const hasWeb = webResults.length > 0;
  if (!hasRecs && !hasWeb) return null;

  // Convert web results to RecommendationData format
  const onlineCards: RecommendationData[] = webResults.slice(0, 3).map((r) => ({
    title: r.title,
    type: "online" as const,
    description: r.description || "External resource found via web search.",
    reason: "",
    link: r.url,
  }));

  const totalCount = recommendations.length + onlineCards.length;

  return (
    <section className="space-y-6" aria-label="Recommended resources">
      {/* Search context banner */}
      <div className="rounded-lg bg-primary/5 border border-primary/15 px-5 py-4 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-base font-semibold text-foreground">Results for:</h2>
        </div>
        <p className="text-lg font-medium text-foreground leading-snug">&ldquo;{query}&rdquo;</p>
        <p className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? "resource" : "resources"} found — here are the most relevant picks for you.
        </p>
      </div>

      {/* Tech Fleet recommendations */}
      {hasRecs && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...recommendations].sort((a, b) => a.title.localeCompare(b.title)).map((rec, idx) => (
            <ExploreRecommendationCard key={`${rec.title}-${idx}`} {...rec} />
          ))}
        </div>
      )}

      {/* Online search results */}
      {hasWeb && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">From the Web</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {onlineCards.map((card, idx) => (
              <ExploreRecommendationCard key={`web-${idx}`} {...card} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
