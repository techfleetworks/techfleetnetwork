import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

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
}

export const StatsService = {
  async getNetworkStats(): Promise<NetworkStats> {
    return log.track("getNetworkStats", "Fetching network stats from database", undefined, async () => {
      const { data, error } = await supabase.rpc("get_network_stats");
      if (error) {
        log.error("getNetworkStats", `Failed to load network stats: ${error.message}`, {
          errorCode: error.code,
          errorDetails: error.details,
        }, error);
        throw new Error("Failed to load network stats.");
      }
      const stats = data as unknown as NetworkStats;
      log.info("getNetworkStats", `Network stats loaded: ${stats.total_signups} total signups`, {
        totalSignups: stats.total_signups,
      });
      return stats;
    });
  },
};
