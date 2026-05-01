/**
 * Subscribe to live System Health changes and update the React Query cache
 * the moment a row in system_health_state or system_remediations changes.
 *
 * Cuts background polling cost by orders of magnitude: instead of every admin
 * tab fetching every minute, we only refetch when something actually changed.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@/lib/react-query";

export function useSystemHealthRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("system-health-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_health_state" },
        () => {
          qc.invalidateQueries({ queryKey: ["system-health"] });
          qc.invalidateQueries({ queryKey: ["system-health", "email-pipeline"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_remediations" },
        () => {
          qc.invalidateQueries({ queryKey: ["system-remediations"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
