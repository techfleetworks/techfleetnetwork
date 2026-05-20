import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isUsableDiscordUsername } from "@/lib/discord/username";

const SESSION_FLAG = "tfn_discord_repair_attempted";

/**
 * Self-heal hook: when a member signs in with a Discord link but a broken/empty
 * stored username, silently call repair-discord-username once per session.
 * Fire-and-forget; failures degrade gracefully (label just stays generic).
 */
export function useDiscordUsernameRepair() {
  const { user, profile, refreshProfile } = useAuth();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (attemptedRef.current) return;

    const linked = typeof profile.discord_user_id === "string" && profile.discord_user_id.trim().length > 0;
    if (!linked) return;
    if (isUsableDiscordUsername(profile.discord_username)) return;

    try {
      if (sessionStorage.getItem(SESSION_FLAG) === user.id) return;
      sessionStorage.setItem(SESSION_FLAG, user.id);
    } catch { /* private mode */ }
    attemptedRef.current = true;

    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await supabase.functions.invoke("repair-discord-username", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.error && (res.data as { repaired?: boolean })?.repaired) {
          await refreshProfile();
        }
      } catch { /* graceful */ }
    })();
  }, [user, profile, refreshProfile]);
}
