import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { handleServiceError } from "@/lib/service-result";

const log = createLogger("StatsService");

export interface NetworkStats {
  total_signups: number;
  core_courses_active: number;
  beginner_courses_active: number;
  advanced_courses_active: number;
  applications_completed: number;
  badges_earned: number;
  prev_week_start: string;
  prev_week_end: string;
  prev_week_signups: number;
  prev_week_core_active: number;
  prev_week_beginner_active: number;
  prev_week_advanced_active: number;
  prev_week_applications: number;
  prev_week_badges: number;
  projects_open_applications: number;
  projects_coming_soon: number;
  projects_live: number;
  projects_previously_completed: number;
}

const CACHE_KEY = "tfn:network-stats:last-known:v1";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CachedNetworkStats {
  stats: NetworkStats;
  cachedAt: number;
}

function readCache(): CachedNetworkStats | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedNetworkStats;
    if (!parsed?.stats || typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(stats: NetworkStats): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ stats, cachedAt: Date.now() } satisfies CachedNetworkStats),
    );
  } catch {
    // Ignore quota / private-mode errors — cache is best-effort.
  }
}

export const StatsService = {
  /**
   * Fetches network stats with graceful degradation: if the live RPC fails,
   * returns the most recently cached stats (up to 7 days old) so the
   * landing/dashboard widget never shows an empty error state.
   */
  async getNetworkStats(): Promise<NetworkStats> {
    return log.track("getNetworkStats", "Fetching network stats from database", undefined, async () => {
      try {
        const { data, error } = await supabase.rpc("get_network_stats");
        if (error) throw error;
        const stats = data as unknown as NetworkStats;
        writeCache(stats);
        log.info("getNetworkStats", `Network stats loaded: ${stats.total_signups} total signups`, {
          totalSignups: stats.total_signups,
        });
        return stats;
      } catch (err) {
        const cached = readCache();
        if (cached) {
          log.warn(
            "getNetworkStats",
            "Live network stats unavailable; serving last-known cached stats",
            { cachedAt: new Date(cached.cachedAt).toISOString() },
            err as Error,
          );
          return cached.stats;
        }
        handleServiceError(err as Error, {
          logger: log,
          action: "getNetworkStats",
          message: `Failed to load network stats: ${(err as Error)?.message ?? "Unknown error"}`,
          throwMessage: "Failed to load network stats.",
        });
        throw err;
      }
    });
  },

  /** Exposed for the UI so it can badge data as "last known" when stale. */
  getCachedNetworkStats(): CachedNetworkStats | null {
    return readCache();
  },
};
