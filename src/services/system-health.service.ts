import { supabase } from "@/integrations/supabase/client";

export interface SystemHealthState {
  status: "healthy" | "degraded" | "overloaded";
  reason: string;
  pause_non_critical: boolean;
  updated_at: string;
}

export interface ErrorFingerprint {
  fingerprint: string;
  event_type: string | null;
  table_name: string | null;
  occurrences: number;
  affected_users: number;
  first_seen: string;
  last_seen: string;
  sample_message: string | null;
}

export interface RemediationRule {
  id: string;
  signature_pattern: string;
  event_type_filter: string | null;
  remediation_function: string;
  description: string;
  enabled: boolean;
  cooldown_seconds: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  run_count: number;
  success_count: number;
}

export const SystemHealthService = {
  /** Latest gauge — admin-only via RLS. */
  async getHealth(): Promise<SystemHealthState | null> {
    const { data, error } = await supabase
      .from("system_health_state" as never)
      .select("status, reason, pause_non_critical, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return (data as SystemHealthState | null) ?? null;
  },

  /** Top fingerprints in the past `hours`. */
  async getTopErrors(hours = 24, limit = 10): Promise<ErrorFingerprint[]> {
    const { data, error } = await supabase.rpc("get_top_error_fingerprints" as never, {
      p_hours: hours,
      p_limit: limit,
    });
    if (error) throw error;
    return (data as ErrorFingerprint[]) ?? [];
  },

  /** Remediation registry rows — admin-only. */
  async getRemediations(): Promise<RemediationRule[]> {
    const { data, error } = await supabase
      .from("system_remediations" as never)
      .select("*")
      .order("description", { ascending: true });
    if (error) throw error;
    return (data as RemediationRule[]) ?? [];
  },

  /** Toggle a rule on/off. */
  async setRemediationEnabled(id: string, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from("system_remediations" as never)
      .update({ enabled })
      .eq("id", id);
    if (error) throw error;
  },

  /** Manually trigger one full pass — useful from the dashboard. */
  async runRemediationsNow(): Promise<{ ran: number }> {
    const { data, error } = await supabase.rpc("run_auto_remediations" as never);
    if (error) throw error;
    return (data as { ran: number }) ?? { ran: 0 };
  },
};
