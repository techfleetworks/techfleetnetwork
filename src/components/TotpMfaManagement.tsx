import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Smartphone, Loader2, Trash2, ShieldCheck, Copy, CheckCircle2, ShieldOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { MfaService, type TotpFactor } from "@/services/mfa.service";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Two-factor authentication (TOTP) management UI.
 * Compatible with Google Authenticator, Authy, 1Password, Microsoft Authenticator.
 * Standards: RFC 6238 (TOTP), RFC 4648 (Base32).
 */
export function TotpMfaManagement() {
  const { user } = useAuth();
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);

  // Enrollment dialog state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [friendlyName, setFriendlyName] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Disable-all dialog state (re-auth required)
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  const totpFactors = factors.filter((f) => f.factor_type === "totp" && f.status === "verified");
  const hasMfa = totpFactors.length > 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await MfaService.listFactors();
      setFactors(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load 2FA settings";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetEnrollment = () => {
    setFriendlyName("");
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setOtpCode("");
    setSecretCopied(false);
    setEnrollError(null);
  };

  const handleStartEnroll = async () => {
    setEnrolling(true);
    setEnrollError(null);
    try {
      const result = await MfaService.enrollTotp(friendlyName);
      setQrCode(result.qrCode);
      setSecret(result.secret);
      setFactorId(result.factorId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start enrollment";
      setEnrollError(message);
      toast.error(message);
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerifyEnroll = async () => {
    if (!factorId || otpCode.length !== 6) return;
    setVerifying(true);
    try {
      await MfaService.verifyEnrollment(factorId, otpCode);
      toast.success("Two-factor authentication enabled");
      setEnrollOpen(false);
      resetEnrollment();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
      setOtpCode("");
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? You'll no longer be prompted for a code from this device.`)) return;
    try {
      await MfaService.unenroll(id);
      toast.success("Two-factor method removed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      toast.success("Secret copied to clipboard");
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Please copy manually.");
    }
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      const pendingFactorId = factorId;
      resetEnrollment();
      if (pendingFactorId) {
        void MfaService.unenroll(pendingFactorId).catch(() => undefined);
      } else {
        void MfaService.cleanupPendingTotp(friendlyName).catch(() => undefined);
      }
    }
    setEnrollOpen(open);
  };

  const handleDisableDialogChange = (open: boolean) => {
    if (!open) setDisablePassword("");
    setDisableOpen(open);
  };

  const handleDisableAll = async () => {
    if (!user?.email) {
      toast.error("Could not verify your identity. Please sign in again.");
      return;
    }
    if (!disablePassword) {
      toast.error("Enter your password to confirm.");
      return;
    }
    setDisabling(true);
    try {
      // Re-authenticate with password to confirm identity before removing 2FA.
      // scope: "local" leaves other device sessions untouched.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: disablePassword,
      });
      if (reauthErr) {
        toast.error("Incorrect password. 2FA was not disabled.");
        return;
      }

      // Remove every TOTP factor (verified or pending).
      const list = await MfaService.listFactors();
      const toRemove = list.filter((f) => f.factor_type === "totp");
      for (const f of toRemove) {
        await MfaService.unenroll(f.id);
      }

      toast.success("Two-factor authentication has been disabled.");
      setDisableOpen(false);
      setDisablePassword("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disable 2FA");
    } finally {
      setDisabling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
          Two-Factor Authentication (2FA)
        </CardTitle>
        <CardDescription>
          Add an extra layer of security with a one-time code from an authenticator app like
          {" "}<strong>Google Authenticator</strong>, Authy, 1Password, or Microsoft Authenticator.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border bg-card p-3">
          <div className="flex items-center gap-3">
            {hasMfa ? (
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
            <div>
              <div className="font-medium">
                {hasMfa ? "2FA is active" : "2FA is not enabled"}
              </div>
              <div className="text-xs text-muted-foreground">
                {hasMfa
                  ? "You'll be asked for a 6-digit code when signing in."
                  : "Optional, but strongly recommended for account security."}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasMfa && (
              <Button
                onClick={() => setDisableOpen(true)}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <ShieldOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Disable 2FA
              </Button>
            )}
            <Button onClick={() => setEnrollOpen(true)} variant={hasMfa ? "outline" : "default"} size="sm">
              {hasMfa ? "Add another" : "Enable 2FA"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Active authenticator apps</Label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
            </div>
          ) : loadError ? (
            <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p>{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={refresh}>
                Retry loading 2FA methods
              </Button>
            </div>
          ) : totpFactors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No authenticator apps registered yet.</p>
          ) : (
            <ul className="space-y-2" aria-label="Active 2FA methods">
              {totpFactors.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-md border bg-card p-3">
                  <div>
                    <div className="font-medium">{f.friendly_name || "Authenticator"}</div>
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Active</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(f.id, f.friendly_name || "this method")}
                      aria-label={`Remove ${f.friendly_name || "authenticator"}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {/* Enrollment dialog */}
      <Dialog open={enrollOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{qrCode ? "Scan the QR code" : "Set up 2FA"}</DialogTitle>
            <DialogDescription>
              {qrCode
                ? "Scan with your authenticator app, then enter the 6-digit code shown."
                : "Give this device a name (e.g. \"iPhone\" or \"Work laptop\")."}
            </DialogDescription>
          </DialogHeader>

          {!qrCode ? (
            <div className="space-y-3 py-2">
              <Label htmlFor="mfa-friendly-name">Device name (optional)</Label>
              <Input
                id="mfa-friendly-name"
                placeholder="e.g. iPhone"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                maxLength={50}
                disabled={enrolling}
                autoFocus
              />
              {enrollError ? (
                <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {enrollError}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex justify-center bg-white rounded-md p-4">
                {/* Supabase returns the QR as an SVG data URI */}
                <img src={qrCode} alt="2FA QR code — scan with your authenticator app" className="h-48 w-48" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Can't scan? Enter this secret manually:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-md bg-muted text-sm font-mono break-all">
                    {secret}
                  </code>
                  <Button type="button" variant="outline" size="icon" onClick={copySecret} aria-label="Copy secret">
                    {secretCopied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mfa-otp-code">Enter the 6-digit code</Label>
                <div className="flex justify-center">
                  <InputOTP
                    id="mfa-otp-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={verifying}
                    autoFocus
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleDialogChange(false)} disabled={enrolling || verifying}>
              Cancel
            </Button>
            {!qrCode ? (
              <Button onClick={handleStartEnroll} disabled={enrolling}>
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={enrolling ? "ml-2" : ""}>Continue</span>
              </Button>
            ) : (
              <Button onClick={handleVerifyEnroll} disabled={verifying || otpCode.length !== 6}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={verifying ? "ml-2" : ""}>Verify &amp; Enable</span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA confirmation dialog (requires password re-auth) */}
      <Dialog open={disableOpen} onOpenChange={handleDisableDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" aria-hidden="true" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              This will remove all of your authenticator apps and stop asking for a 6-digit code at sign-in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>
                Your account will be less secure after disabling 2FA. We strongly recommend keeping it on.
              </span>
            </div>

            <Label htmlFor="disable-2fa-password">Confirm your password</Label>
            <Input
              id="disable-2fa-password"
              type="password"
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              disabled={disabling}
              placeholder="Enter your password"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              We re-check your password to make sure it's really you.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => handleDisableDialogChange(false)}
              disabled={disabling}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableAll}
              disabled={disabling || !disablePassword}
            >
              {disabling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={disabling ? "ml-2" : ""}>Disable 2FA</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
