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
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useNavigate } from "react-router-dom";

export function IdleTimeoutGuard() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const timeoutMinutes = isAdmin ? 15 : 20;

  const handleTimeout = useCallback(async () => {
    setShowWarning(false);
    await signOut();
    navigate("/login", { replace: true });
  }, [signOut, navigate]);

  const handleWarning = useCallback(() => {
    setShowWarning(true);
  }, []);

  const { resetTimers } = useIdleTimeout({
    timeoutMs: timeoutMinutes * 60 * 1000,
    warningMs: 2 * 60 * 1000,   // warn 2 min before
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
            You've been inactive for {timeoutMinutes - 2} minutes. You'll be signed out in 2 minutes for security. Click below to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleTimeout}>Sign out now</Button>
          <Button onClick={handleStaySignedIn}>Stay signed in</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
