/**
 * Custom hook for the Explore feature — connects the ExploreService
 * to React state with proper lifecycle management.
 *
 * Enterprise concerns:
 * - AbortController for in-flight request cancellation
 * - Proper cleanup on unmount
 * - Memoized callbacks to prevent unnecessary re-renders
 * - Error categorisation for UI feedback
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { reportError } from "@/services/error-reporter.service";
import {
  explore as exploreService,
  loadPopularAndRecent,
  ExploreError,
  type PopularQuery,
  type PopularQueryData,
} from "@/services/explore.service";
import type { WebSearchResult } from "@/components/resources/ExploreResultsSection";

export interface UseExploreReturn {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  responseMarkdown: string;
  webResults: WebSearchResult[];
  popularQueries: PopularQuery[];
  allPopularQueries: PopularQuery[];
  recentQueries: string[];
  loadingPopular: boolean;
  showAllPopular: boolean;
  setShowAllPopular: (v: boolean) => void;
  explore: (searchQuery: string) => void;
  reset: () => void;
  clearRecents: () => void;
}

export function useExplore(): UseExploreReturn {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [responseMarkdown, setResponseMarkdown] = useState("");
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [popularQueries, setPopularQueries] = useState<PopularQuery[]>([]);
  const [allPopularQueries, setAllPopularQueries] = useState<PopularQuery[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [showAllPopular, setShowAllPopular] = useState(false);

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Load popular & recent on mount
  useEffect(() => {
    let cancelled = false;
    loadPopularAndRecent()
      .then((data: PopularQueryData) => {
        if (cancelled) return;
        setPopularQueries(data.top5);
        setAllPopularQueries(data.all);
        setRecentQueries(data.recents);
      })
      .catch(() => {
        // Silent fail — non-critical
      })
      .finally(() => {
        if (!cancelled) setLoadingPopular(false);
      });
    return () => { cancelled = true; };
  }, []);

  const refreshPopular = useCallback(() => {
    loadPopularAndRecent()
      .then((data: PopularQueryData) => {
        if (!mountedRef.current) return;
        setPopularQueries(data.top5);
        setAllPopularQueries(data.all);
        setRecentQueries(data.recents);
      })
      .catch(() => {});
  }, []);

  const doExplore = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim() || loading) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setResponseMarkdown("");
      setWebResults([]);
      setQuery(searchQuery);

      exploreService({
        query: searchQuery,
        userId: user?.id,
        onChunk: (fullText) => {
          if (mountedRef.current) setResponseMarkdown(fullText);
        },
        onWebResults: (results) => {
          if (mountedRef.current) setWebResults(results);
        },
        signal: controller.signal,
      })
        .then(() => {
          // Refresh popular counts after successful explore
          if (mountedRef.current) refreshPopular();
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;

          if (err instanceof ExploreError) {
            toast({ title: err.message, variant: "destructive" });
          } else {
            toast({ title: "Failed to get recommendations. Please try again.", variant: "destructive" });
            reportError(err, "useExplore.doExplore", user?.id);
          }
        })
        .finally(() => {
          if (mountedRef.current) setLoading(false);
        });
    },
    [user, loading, refreshPopular],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setQuery("");
    setResponseMarkdown("");
    setWebResults([]);
  }, []);

  const clearRecents = useCallback(() => {
    setRecentQueries([]);
  }, []);

  return {
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
    explore: doExplore,
    reset,
    clearRecents,
  };
}
