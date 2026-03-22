import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ExploreRecommendationCard, { type RecommendationData } from "./ExploreRecommendationCard";

interface ExploreResultsSectionProps {
  query: string;
  recommendations: RecommendationData[];
}

export default function ExploreResultsSection({ query, recommendations }: ExploreResultsSectionProps) {
  if (recommendations.length === 0) return null;

  return (
    <section className="space-y-4" aria-label="Recommended resources">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-base font-semibold text-foreground">Recommended Resources</h2>
          <Badge variant="secondary" className="text-xs">
            {recommendations.length} {recommendations.length === 1 ? "result" : "results"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Based on your interest in <span className="font-medium text-foreground">{query}</span>, here are the most relevant resources.
        </p>
      </div>

      {/* Card grid: 1 col mobile/tablet, 2 col desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recommendations.map((rec, idx) => (
          <ExploreRecommendationCard key={`${rec.title}-${idx}`} {...rec} />
        ))}
      </div>
    </section>
  );
}
