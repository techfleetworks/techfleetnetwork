import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("useDiscordRoleRetry");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * On login, drains queued Discord role grants for the user.
 * Failures stay queued and back off — UI is never blocked.
 */
export function useDiscordRoleRetry() {
  const { user, session } = useAuth();
  const triedRef = useRef(false);

  useEffect(() => {
    if (!user || !session || triedRef.current) return;
    triedRef.current = true;

    let cancelled = false;

    const drain = async () => {
      try {
        const { data: pending, error } = await sb.rpc("list_pending_role_grants_for_user", {
          p_user_id: user.id,
        });
        if (error || !Array.isArray(pending) || pending.length === 0) return;
        if (cancelled) return;

        for (const row of pending as Array<{ id: string; discord_user_id: string; role_id: string }>) {
          if (cancelled) break;
          try {
            const res = await supabase.functions.invoke("manage-discord-roles", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { action: "assign", discord_user_id: row.discord_user_id, role_id: row.role_id },
            });
            const ok = !res.error && (res.data as { success?: boolean })?.success !== false;
            await sb.rpc("mark_discord_role_grant_result", {
              p_id: row.id,
              p_success: ok,
              p_error: ok ? null : (res.error?.message ?? "retry failed"),
            });
            if (ok) log.info("retry", `Granted queued role ${row.role_id}`);
          } catch (err) {
            await sb.rpc("mark_discord_role_grant_result", {
              p_id: row.id,
              p_success: false,
              p_error: err instanceof Error ? err.message : "unknown",
            });
          }
        }
      } catch {
        /* non-blocking */
      }
    };

    const timer = window.setTimeout(drain, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, session]);
}
