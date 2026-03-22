/**
 * ExploreTab — enterprise-grade UI layer.
 *
 * All business logic is delegated to useExplore hook and ExploreService.
 * This component handles only rendering and user interaction.
 */

import { memo, useCallback } from "react";
import { Search, Loader2, Sparkles, Clock, TrendingUp, RotateCcw, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExploreResultsSection from "./ExploreResultsSection";
import { parseRecommendations } from "@/lib/parse-explore-recommendations";
import { useExplore } from "@/hooks/use-explore";
import type { PopularQuery } from "@/services/explore.service";

// ─── Sub-components (memoised to prevent unnecessary re-renders) ─────

const PopularCard = memo(function PopularCard({
  pq,
  onExplore,
}: {
  pq: PopularQuery;
  onExplore: (q: string) => void;
}) {
  return (
    <button
      onClick={() => onExplore(pq.query_text)}
      className="text-left rounded-lg border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
      aria-label={`Explore: ${pq.query_text}`}
    >
      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors capitalize line-clamp-2">
        {pq.query_text}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {pq.count} {pq.count === 1 ? "person" : "people"} also explored this
      </p>
    </button>
  );
});

const RecentBadge = memo(function RecentBadge({
  text,
  onExplore,
}: {
  text: string;
  onExplore: (q: string) => void;
}) {
  return (
    <Badge
      variant="secondary"
      className="cursor-pointer hover:bg-primary/10 transition-colors capitalize"
      onClick={() => onExplore(text)}
    >
      {text}
    </Badge>
  );
});

// ─── Main Component ──────────────────────────────────────────────────

export default function ExploreTab() {
  const {
    query,
    setQuery,
    loading,
    responseMarkdown,
    webResults,
    popularQueries,
    allPopularQueries,
    recentQueries,
    loadingPopular,
    showAllPopular,
    setShowAllPopular,
    explore,
    reset,
    clearRecents,
  } = useExplore();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      explore(query);
    },
    [explore, query],
  );

  const hasResults = Boolean(responseMarkdown) && !loading;

  return (
    <div className="space-y-6">
      {/* Search form */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 mb-4">
            <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">What are you trying to do?</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Describe your goal and Fleety will recommend the best resources, handbooks, and courses for you.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. "Learn how to facilitate a design sprint" or "Prepare for my first project"'
              className="flex-1"
              disabled={loading}
              aria-label="Describe what you are trying to do"
              maxLength={500}
            />
            <Button type="submit" disabled={loading || !query.trim()} className="gap-1.5 shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Explore
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Structured results */}
      {hasResults && (
        <ExploreResultsSection
          query={query}
          recommendations={parseRecommendations(responseMarkdown)}
          webResults={webResults}
          onReset={reset}
        />
      )}

      {/* Loading state with query echo */}
      {loading && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Fleety is finding resources for:</p>
            <p className="text-base font-semibold text-foreground">&ldquo;{query}&rdquo;</p>
          </CardContent>
        </Card>
      )}

      {/* Suggestions section - show when no results */}
      {!responseMarkdown && !loading && (
        <div className="space-y-6">
          {/* Popular explorations - top 5 */}
          {popularQueries.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Popular Explorations
                </h3>
                {allPopularQueries.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => setShowAllPopular(true)}
                  >
                    See All ({allPopularQueries.length})
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {popularQueries.map((pq) => (
                  <PopularCard key={pq.query_text} pq={pq} onExplore={explore} />
                ))}
              </div>
            </div>
          )}

          {/* Recent explorations */}
          {recentQueries.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Your Recently Explored
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                  onClick={clearRecents}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentQueries.map((rq) => (
                  <RecentBadge key={rq} text={rq} onExplore={explore} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loadingPopular && popularQueries.length === 0 && recentQueries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Be the first to explore! Type what you're trying to do above.</p>
            </div>
          )}
        </div>
      )}

      {/* All Popular side panel */}
      <Sheet open={showAllPopular} onOpenChange={setShowAllPopular}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              All Popular Explorations
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] mt-4 pr-2">
            <div className="space-y-2">
              {allPopularQueries.map((pq, idx) => (
                <button
                  key={pq.query_text}
                  onClick={() => {
                    setShowAllPopular(false);
                    explore(pq.query_text);
                  }}
                  className="w-full text-left rounded-lg border bg-card p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200 group flex items-center justify-between gap-3"
                  aria-label={`Explore: ${pq.query_text}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">{idx + 1}</span>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors capitalize break-words overflow-wrap-anywhere">
                      {pq.query_text}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {pq.count}
                  </Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
