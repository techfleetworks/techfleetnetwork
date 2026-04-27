import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { usePasskeyEnrolled } from "@/hooks/use-passkey-enrolled";
import { PasskeyLoginService } from "@/services/passkey-login.service";

/**
 * Returns the current passkey-login gate state for the authenticated user.
 *
 * needsGate === true ONLY when:
 *   - user is authenticated
 *   - user is an admin
 *   - user has at least one passkey enrolled
 *   - the current JWT session has not completed a passkey proof
 *
 * Non-admins, admins without a passkey enrolled, and verified JWT sessions all
 * return needsGate === false (so the gate stays out of their way).
 */
export function usePasskeyLoginGate() {
  const { user, session, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const passkeyEnrolled = usePasskeyEnrolled();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheckedUserId, setLastCheckedUserId] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    if (!user || !session) {
      setVerified(null);
      setLastCheckedUserId(null);
      return;
    }
    setChecking(true);
    try {
      const ok = await PasskeyLoginService.isCurrentSessionVerified();
      setVerified(ok);
      setLastCheckedUserId(user.id);
    } catch {
      setVerified(false);
      setLastCheckedUserId(user.id);
    } finally {
      setChecking(false);
    }
  }, [user, session]);

  const markVerified = useCallback(() => {
    setVerified(true);
    setLastCheckedUserId(user?.id ?? null);
    setChecking(false);
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user) { setVerified(null); return; }
    if (!isAdmin) { setVerified(true); return; } // non-admins are not gated
    if (passkeyEnrolled === null) return;        // wait for passkey check
    if (passkeyEnrolled === false) { setVerified(true); return; } // no passkey → gate is no-op
    if (lastCheckedUserId !== user.id) setVerified(null);
    if (verified === true && lastCheckedUserId === user.id) return;
    if (lastCheckedUserId === user.id && checking) return;
    void recheck();
  }, [authLoading, adminLoading, user, isAdmin, passkeyEnrolled, verified, lastCheckedUserId, checking, recheck]);

  const ready = !authLoading && !adminLoading && (!user || !isAdmin || passkeyEnrolled !== null);
  const needsGate = ready && !!user && isAdmin && passkeyEnrolled === true && verified === false;

  return { needsGate, ready, checking, recheck, markVerified };
}
