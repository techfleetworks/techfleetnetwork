import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("StatsService");

export interface NetworkStats {
  total_members: number;
  first_steps_active: number;
  first_steps_completed: number;
  second_steps_active: number;
  second_steps_completed: number;
  third_steps_active: number;
  third_steps_completed: number;
  new_members_7d: number;
  first_steps_active_7d: number;
  first_steps_completed_7d: number;
  second_steps_active_7d: number;
  second_steps_completed_7d: number;
  third_steps_active_7d: number;
  third_steps_completed_7d: number;
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
      log.info("getNetworkStats", `Network stats loaded: ${stats.total_members} total members, ${stats.new_members_7d} new in 7d`, {
        totalMembers: stats.total_members,
        newMembers7d: stats.new_members_7d,
      });
      return stats;
    });
  },
};
