import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MfaService } from "@/services/mfa.service";
import { MfaChallengeDialog } from "@/components/MfaChallengeDialog";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("MfaEnforcementGuard");

/**
 * Global MFA gate. Runs on every authenticated session and forces a TOTP challenge
 * whenever the user is at AAL1 but has a verified TOTP factor (i.e., nextLevel === 'aal2').
 *
 * This catches all sign-in paths — password, Google OAuth, magic link, token refresh —
 * not just the password form on /login.
 */
export function MfaEnforcementGuard() {
  const { user, session, loading } = useAuth();
  const [challengeOpen, setChallengeOpen] = useState(false);
  const lastCheckedToken = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user || !session) {
      lastCheckedToken.current = null;
      setChallengeOpen(false);
      return;
    }

    // Avoid re-checking the same access token repeatedly (e.g., after re-renders).
    if (lastCheckedToken.current === session.access_token) return;
    lastCheckedToken.current = session.access_token;

    let cancelled = false;
    void (async () => {
      try {
        const { needsChallenge } = await MfaService.getAssuranceLevel();
        if (!cancelled && needsChallenge) {
          log.info("check", `User ${user.id} is at AAL1 with enrolled TOTP — prompting challenge`);
          setChallengeOpen(true);
        }
      } catch (e) {
        log.warn("check", `AAL check failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
      }
    })();

    return () => { cancelled = true; };
  }, [user, session, loading]);

  return (
    <MfaChallengeDialog
      open={challengeOpen}
      onSuccess={() => {
        setChallengeOpen(false);
        // Force token refresh marker so AAL re-evaluates next render
        lastCheckedToken.current = null;
      }}
      onCancel={async () => {
        setChallengeOpen(false);
        // User refused MFA — sign out fully to prevent half-authenticated AAL1 access
        await supabase.auth.signOut();
        window.location.replace("/login");
      }}
    />
  );
}
