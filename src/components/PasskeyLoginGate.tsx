import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PasskeyLoginService } from "@/services/passkey-login.service";
import { usePasskeyLoginGate } from "@/hooks/use-passkey-login-gate";

const BYPASS_FOR_A11Y_AUDIT = import.meta.env.VITE_A11Y_AUDIT_BYPASS_ADMIN_PASSKEY_GATE === "1";

/**
 * Global gate that intercepts admin sessions immediately after login and
 * forces a WebAuthn passkey verification before allowing further navigation.
 * Provides an email recovery fallback for admins who can't access their passkey.
 *
 * Mounted once at the app shell — runs invisibly for non-admins, admins
 * without a passkey, and admins whose session has already been verified.
 */
export function PasskeyLoginGate() {
  const { needsGate, markVerified } = usePasskeyLoginGate();
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);

  useEffect(() => {
    if (!verificationComplete) return;
    const timeout = window.setTimeout(() => setVerificationComplete(false), 900);
    return () => window.clearTimeout(timeout);
  }, [verificationComplete]);

  // CI-only escape hatch for the WCAG route audit. This does NOT weaken
  // production auth unless the dedicated build-time env var is set.
  if (BYPASS_FOR_A11Y_AUDIT) return null;

  if (!needsGate && !verificationComplete) return null;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await PasskeyLoginService.verify();
      setVerificationComplete(true);
      markVerified();
      toast.success("Passkey verified");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleSendRecovery = async () => {
    setSending(true);
    try {
      await PasskeyLoginService.requestRecoveryEmail();
      setEmailSent(true);
      toast.success("Recovery link sent to your email");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send recovery email");
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  return (
    <Dialog open modal>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {verificationComplete ? (
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <DialogTitle className="text-center">Access verified</DialogTitle>
            <DialogDescription className="text-center" aria-live="polite">
              Passkey confirmed. Taking you into the app now…
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <DialogTitle className="text-center">Verify your passkey</DialogTitle>
            <DialogDescription className="text-center">
              Admin access requires a passkey check on each new device, then once every 30 days. We won't ask again on this device until the trust window expires.
            </DialogDescription>
          </DialogHeader>
        )}

        {!verificationComplete && <div className="space-y-3 pt-2">
          <Button onClick={handleVerify} disabled={verifying} className="w-full" size="lg">
            {verifying ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Verifying…</>
            ) : (
              <><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />Verify with passkey</>
            )}
          </Button>

          {!emailSent ? (
            <Button onClick={handleSendRecovery} disabled={sending} variant="outline" className="w-full">
              {sending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Sending…</>
              ) : (
                <><Mail className="mr-2 h-4 w-4" aria-hidden="true" />Email me a recovery link</>
              )}
            </Button>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Check your inbox for a one-time recovery link. It expires in 15 minutes.
            </div>
          )}

          <Button onClick={handleSignOut} variant="ghost" className="w-full text-muted-foreground">
            Sign out
          </Button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
