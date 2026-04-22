import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, KeyRound, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PasskeyService, type PasskeyCredential } from "@/services/passkey.service";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";

export function PasskeyManagement() {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [deviceName, setDeviceName] = useState("");

  const supported = PasskeyService.isSupported();
  const adminRequiresPasskey = isAdmin && passkeys.length === 0 && !loading;

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await PasskeyService.list(user.id);
      setPasskeys(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load passkeys");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleEnroll = async () => {
    setEnrolling(true);
    const wasFirstPasskey = passkeys.length === 0;
    try {
      await PasskeyService.enroll(deviceName || `Passkey on ${new Date().toLocaleDateString()}`);
      setDeviceName("");
      await refresh();
      if (wasFirstPasskey && isAdmin) {
        toast.success("Passkey enrolled — admin access unlocked", {
          description: "You can now open the admin area without any extra steps.",
          duration: 6000,
        });
      } else {
        toast.success("Passkey enrolled successfully");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this passkey? You'll need another sign-in method.")) return;
    try {
      await PasskeyService.remove(id);
      toast.success("Passkey removed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove passkey");
    }
  };

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Passkeys</CardTitle>
          <CardDescription>Your browser does not support passkeys. Try Safari, Chrome, or Edge on a modern device.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Passkeys (WebAuthn MFA)
        </CardTitle>
        <CardDescription>
          Sign in with Face ID, Touch ID, Windows Hello, or a hardware key. Passkeys are phishing-resistant and far more secure than passwords.
          {isAdmin && (
            <span className="block mt-2 font-medium text-foreground">
              Admin accounts must enroll at least one passkey to access the admin area.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {adminRequiresPasskey && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Action required:</strong> Enroll a passkey to retain access to admin pages.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="device-name">Device name (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="device-name"
              placeholder="e.g. MacBook Pro Touch ID"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              maxLength={50}
              disabled={enrolling}
            />
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span className="ml-2">Add passkey</span>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Enrolled passkeys</Label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passkeys enrolled yet.</p>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center justify-between rounded-md border bg-card p-3">
                  <div>
                    <div className="font-medium">{pk.device_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(pk.created_at).toLocaleDateString()}
                      {pk.last_used_at && <> · Last used {new Date(pk.last_used_at).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Active</Badge>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(pk.id)} aria-label="Remove passkey">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
