import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { invokeEdge } from "@/lib/edge/invokeEdge";
import { rpcWithTimeout } from "@/lib/db/rpc-with-timeout";
import { createLogger } from "@/services/logger.service";

const log = createLogger("useDiscordRoleRetry");

/**
 * On login, drains queued Discord role grants for the user.
 * Failures stay queued and back off — UI is never blocked.
 * All RPCs use rpcWithTimeout (8s) so a wedged PostgREST stream cannot pin
 * this hook open indefinitely.
 */
export function useDiscordRoleRetry() {
  const { user, session } = useAuth();
  const triedRef = useRef(false);

  useEffect(() => {
    if (!user || !session || triedRef.current) return;
    triedRef.current = true;

    let cancelled = false;

    const drain = async () => {
      const { data: pending, error } = await rpcWithTimeout<Array<{ id: string; discord_user_id: string; role_id: string }>>(
        "list_pending_role_grants_for_user",
        { p_user_id: user.id },
      );
      if (error || !Array.isArray(pending) || pending.length === 0) return;
      if (cancelled) return;

      for (const row of pending) {
        if (cancelled) break;
        try {
          // invokeEdge throws on failure; the existing catch records the failure in the grant ledger
          // (the retry/backoff source of truth), so silentReport avoids audit noise from this drain loop.
          const data = await invokeEdge<{ success?: boolean }>("manage-discord-roles", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { action: "assign", discord_user_id: row.discord_user_id, role_id: row.role_id },
            silentReport: true,
          });
          const ok = data?.success !== false;
          await rpcWithTimeout("mark_discord_role_grant_result", {
            p_id: row.id,
            p_success: ok,
            p_error: ok ? null : "retry failed",
          });
          if (ok) log.info("retry", `Granted queued role ${row.role_id}`);
        } catch (err) {
          await rpcWithTimeout("mark_discord_role_grant_result", {
            p_id: row.id,
            p_success: false,
            p_error: err instanceof Error ? err.message : "unknown",
          });
        }
      }
    };

    const timer = window.setTimeout(() => { void drain(); }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, session]);
}
