import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, Sparkles, Clock, TrendingUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import ExploreResultsSection from "./ExploreResultsSection";
import { parseRecommendations } from "@/lib/parse-explore-recommendations";
import { normalizeQueryKey } from "@/lib/normalize-query";


interface PopularQuery {
  query_text: string;
  count: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/techfleet-chat`;

const EXPLORE_SYSTEM_OVERRIDE = `The user is exploring Tech Fleet resources. Based on what they want to accomplish, recommend specific handbooks, workshops, courses, and resources from the Tech Fleet knowledge base.

IMPORTANT: Structure your response EXACTLY as a list of recommendations. For EACH recommendation use this format:

### [Resource Name]
**Type:** Course | Template | User Guide | Project
**Description:** A short summary of what this resource covers.
**🌟 Why We Recommend:** In 1-2 simple sentences written at a 6th grade reading level, explain why this resource will help the user based on what they typed. Use everyday language a 12-year-old would understand. Connect it directly to what the user said they want to do.
**Link:** The direct URL to the resource if known. Use the techfleet.org domain when available.

Type mapping rules:
- Training courses, learning paths → Course
- Workshop templates, facilitation guides → Template
- Handbooks, user guides, onboarding docs → User Guide
- Project-related resources, tools → Project

Provide 3-6 specific, actionable recommendations. Focus on resources that directly help the user accomplish their goal. Always prioritize the most relevant resources first.`;

export default function ExploreTab() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [responseMarkdown, setResponseMarkdown] = useState("");
  const [popularQueries, setPopularQueries] = useState<PopularQuery[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);

  // Fetch popular and recent queries
  useEffect(() => {
    async function loadQueries() {
      try {
        const { data, error } = await supabase
          .from("exploration_queries")
          .select("query_text, created_at, user_id")
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;

        if (data && data.length > 0) {
          // Count unique users per normalized query (fuzzy grouping)
          const queryUsers = new Map<string, { users: Set<string>; displayText: string }>();
          data.forEach((row) => {
            const key = normalizeQueryKey(row.query_text);
            if (!key) return;
            if (!queryUsers.has(key)) queryUsers.set(key, { users: new Set(), displayText: row.query_text.trim() });
            queryUsers.get(key)!.users.add(row.user_id);
          });

          const sorted = Array.from(queryUsers.entries())
            .sort((a, b) => b[1].users.size - a[1].users.size)
            .slice(0, 6)
            .map(([, entry]) => ({ query_text: entry.displayText, count: entry.users.size }));

          setPopularQueries(sorted);

          // Get recent unique queries (last 5, deduplicated by fuzzy key)
          const seenKeys = new Set<string>();
          const recents: string[] = [];
          for (const row of data) {
            const key = normalizeQueryKey(row.query_text);
            if (key && !seenKeys.has(key) && recents.length < 5) {
              seenKeys.add(key);
              recents.push(row.query_text.trim());
            }
          }
          setRecentQueries(recents);
        }
      } catch {
        // Silent fail for suggestions
      } finally {
        setLoadingPopular(false);
      }
    }
    loadQueries();
  }, []);

  const explore = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return;

      const normalized = searchQuery.trim().toLowerCase();
      setLoading(true);
      setResponseMarkdown("");
      setQuery(searchQuery);

      try {
        // Save the query
        if (user) {
          await supabase.from("exploration_queries").insert({
            user_id: user.id,
            query_text: searchQuery.trim(),
          });
        }

        // Check cache first
        const { data: cached } = await supabase
          .from("exploration_cache")
          .select("id, response_markdown")
          .eq("query_normalized", normalized)
          .maybeSingle();

        if (cached?.response_markdown) {
          setResponseMarkdown(cached.response_markdown);
          // Increment hit count in background
          supabase
            .from("exploration_cache")
            .update({ hit_count: undefined as unknown as number })
            .eq("id", cached.id)
            .then(() => {
              // Use raw SQL-style increment via rpc if needed; for now just skip
            });
          setLoading(false);
          return;
        }

        // Stream response from Fleety
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: EXPLORE_SYSTEM_OVERRIDE },
              {
                role: "user",
                content: `I want to: ${searchQuery.trim()}\n\nPlease recommend the most relevant Tech Fleet resources, handbooks, workshops, and courses that will help me accomplish this.`,
              },
            ],
          }),
        });

        if (!resp.ok) {
          if (resp.status === 429) {
            toast({ title: "Too many requests. Please wait a moment.", variant: "destructive" });
            setLoading(false);
            return;
          }
          if (resp.status === 402) {
            toast({ title: "AI usage limit reached. Please try again later.", variant: "destructive" });
            setLoading(false);
            return;
          }
          throw new Error("Failed to get recommendations");
        }

        if (!resp.body) throw new Error("No response body");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let fullText = "";
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) {
                fullText += content;
                setResponseMarkdown(fullText);
              }
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }

        // Final flush
        if (textBuffer.trim()) {
          for (let raw of textBuffer.split("\n")) {
            if (!raw) continue;
            if (raw.endsWith("\r")) raw = raw.slice(0, -1);
            if (raw.startsWith(":") || raw.trim() === "") continue;
            if (!raw.startsWith("data: ")) continue;
            const jsonStr = raw.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) {
                fullText += content;
                setResponseMarkdown(fullText);
              }
            } catch {
              /* ignore */
            }
          }
        }

        // Cache the result for future queries
        if (fullText.trim()) {
          await supabase.from("exploration_cache").upsert(
            { query_normalized: normalized, response_markdown: fullText },
            { onConflict: "query_normalized" }
          );
        }
      } catch (err) {
        console.error("Explore error:", err);
        toast({ title: "Failed to get recommendations. Please try again.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    explore(query);
  };

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
      {responseMarkdown && !loading && (
        <ExploreResultsSection
          query={query}
          recommendations={parseRecommendations(responseMarkdown)}
        />
      )}

      {/* Streaming preview while loading */}
      {responseMarkdown && loading && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Fleety is finding resources…</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !responseMarkdown && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Fleety is finding the best resources for you…</p>
          </CardContent>
        </Card>
      )}

      {/* Suggestions section - show when no results */}
      {!responseMarkdown && !loading && (
        <div className="space-y-6">
          {/* Popular explorations */}
          {popularQueries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                Popular Explorations
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {popularQueries.map((pq) => (
                  <button
                    key={pq.query_text}
                    onClick={() => {
                      setQuery(pq.query_text);
                      explore(pq.query_text);
                    }}
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
                ))}
              </div>
            </div>
          )}

          {/* Recent explorations */}
          {recentQueries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recently Explored
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentQueries.map((rq) => (
                  <Badge
                    key={rq}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary/10 transition-colors capitalize"
                    onClick={() => {
                      setQuery(rq);
                      explore(rq);
                    }}
                  >
                    {rq}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when nothing loaded yet */}
          {!loadingPopular && popularQueries.length === 0 && recentQueries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Be the first to explore! Type what you're trying to do above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
