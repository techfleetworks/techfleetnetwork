import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { usePasskeyEnrolled } from "@/hooks/use-passkey-enrolled";
import { MfaService } from "@/services/mfa.service";
import { MfaChallengeDialog } from "@/components/MfaChallengeDialog";
import { PasskeyLoginService } from "@/services/passkey-login.service";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("MfaEnforcementGuard");

/**
 * Global TOTP MFA gate. Runs on every authenticated session and forces a TOTP
 * challenge whenever the user is at AAL1 but has a verified TOTP factor.
 *
 * Policy: Admins who already have a passkey enrolled are NOT challenged for TOTP
 * here — the PasskeyLoginGate is their primary admin factor, and stacking both
 * prompts on the same sign-in is redundant. They can still manage TOTP voluntarily
 * from /profile/edit. Non-admins (and admins without a passkey) are still
 * TOTP-gated as before.
 */
export function MfaEnforcementGuard() {
  const { user, session, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const passkeyEnrolled = usePasskeyEnrolled();
  const [challengeOpen, setChallengeOpen] = useState(false);
  const lastCheckedToken = useRef<string | null>(null);

  useEffect(() => {
    if (loading || adminLoading || !user || !session) {
      lastCheckedToken.current = null;
      setChallengeOpen(false);
      return;
    }

    // Admins with a passkey use the PasskeyLoginGate as their primary factor —
    // skip the TOTP prompt to avoid the double-prompt UX.
    if (isAdmin && passkeyEnrolled === true) {
      lastCheckedToken.current = session.access_token;
      setChallengeOpen(false);
      return;
    }

    // Wait for the passkey enrollment check to resolve (null = unknown) before
    // deciding whether to gate, so we don't briefly flash the TOTP dialog.
    if (isAdmin && passkeyEnrolled === null) return;

    // Avoid re-checking the same access token repeatedly (e.g., after re-renders).
    if (lastCheckedToken.current === session.access_token) return;
    lastCheckedToken.current = session.access_token;

    let cancelled = false;
    void (async () => {
      try {
        const { needsChallenge } = await MfaService.getAssuranceLevel();
        if (!needsChallenge || cancelled) return;
        // Unified 30-day device trust: if THIS device already passed a
        // strong second factor (passkey or TOTP) within the trust window,
        // skip the TOTP prompt entirely. This is what makes the "ask once
        // every 30 days per device" promise actually hold.
        const deviceTrusted = await PasskeyLoginService.isCurrentSessionVerified();
        if (cancelled) return;
        if (deviceTrusted) {
          log.info("check", `Device already trusted — skipping TOTP prompt for ${user.id}`);
          return;
        }
        log.info("check", `User ${user.id} is at AAL1 with enrolled TOTP — prompting challenge`);
        setChallengeOpen(true);
      } catch (e) {
        log.warn("check", `AAL check failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
      }
    })();

    return () => { cancelled = true; };
  }, [user, session, loading, adminLoading, isAdmin, passkeyEnrolled]);

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
