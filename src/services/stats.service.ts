import { supabase } from "@/integrations/supabase/client";

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
    const { data, error } = await supabase.rpc("get_network_stats");
    if (error) throw new Error("Failed to load network stats.");
    return data as unknown as NetworkStats;
  },
};
