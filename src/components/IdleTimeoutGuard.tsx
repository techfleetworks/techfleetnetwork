import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { SESSION_IDLE_TIMEOUT_MS, SESSION_IDLE_WARNING_MS } from "@/lib/session-timeout-policy";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useNavigate } from "react-router-dom";
import { logAccountActivity } from "@/lib/account-activity";

export function IdleTimeoutGuard() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  // Derived from the single-owner policy (src/lib/session-timeout-policy.ts) — do
  // NOT hardcode a duration here; a second copy is the drift ADR-0049 removed.
  const idleMinutes = Math.round(SESSION_IDLE_TIMEOUT_MS / 60_000);
  const warnMinutes = Math.round(SESSION_IDLE_WARNING_MS / 60_000);

  const handleTimeout = useCallback(async () => {
    setShowWarning(false);
    void logAccountActivity("session_idle_timeout", {
      userId: user?.id ?? null,
      details: { timeoutMinutes: String(idleMinutes) },
    });
    await signOut();
    navigate("/login", { replace: true });
  }, [signOut, navigate, user?.id, idleMinutes]);

  const handleWarning = useCallback(() => {
    setShowWarning(true);
  }, []);

  const { resetTimers } = useIdleTimeout({
    onWarning: handleWarning,
    onTimeout: handleTimeout,
    enabled: !!user,
  });

  const handleStaySignedIn = () => {
    setShowWarning(false);
    resetTimers();
  };

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session expiring soon</AlertDialogTitle>
          <AlertDialogDescription>
            You've been inactive for {idleMinutes - warnMinutes} minutes. You'll be signed out in{" "}
            {warnMinutes} minutes for security. Click below to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleTimeout}>
            Sign out now
          </Button>
          <Button onClick={handleStaySignedIn}>Stay signed in</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
