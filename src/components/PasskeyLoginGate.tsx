import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PasskeyLoginService } from "@/services/passkey-login.service";
import { usePasskeyLoginGate } from "@/hooks/use-passkey-login-gate";

/**
 * Global gate that intercepts admin sessions immediately after login and
 * forces a WebAuthn passkey verification before allowing further navigation.
 * Provides an email recovery fallback for admins who can't access their passkey.
 *
 * Mounted once at the app shell — runs invisibly for non-admins, admins
 * without a passkey, and admins whose session has already been verified.
 */
export function PasskeyLoginGate() {
  const { needsGate, recheck } = usePasskeyLoginGate();
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  if (!needsGate) return null;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await PasskeyLoginService.verify();
      toast.success("Passkey verified");
      await recheck();
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
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">Verify your passkey</DialogTitle>
          <DialogDescription className="text-center">
            Admin access requires a passkey check on every new sign-in. This keeps your account secure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
