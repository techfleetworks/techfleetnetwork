import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { passwordSchema } from "@/lib/validators/auth";
import { supabase } from "@/integrations/supabase/client";
import techFleetLogo from "@/assets/tech-fleet-logo.svg";

const passwordRequirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validRecovery, setValidRecovery] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let settled = false;
    const settle = (valid: boolean) => {
      if (settled) return;
      settled = true;
      setValidRecovery(valid);
      setChecking(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settle(true);
      }
    });

    // Check if the URL hash contains a recovery token
    const hash = window.location.hash;
    const hasRecoveryInHash = hash.includes("type=recovery");

    if (!hasRecoveryInHash) {
      // No recovery hash — check for an existing session (link may have already been consumed)
      supabase.auth.getSession().then(({ data: { session } }) => {
        settle(!!session);
      });
    } else {
      // Hash is present — Supabase SDK will process it asynchronously.
      // Wait up to 5s for the PASSWORD_RECOVERY event before giving up.
      const timeout = setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          settle(!!session);
        });
      }, 5000);
      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError("");
    setLoading(true);

    try {
      await AuthService.updatePassword(result.data);
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center animate-fade-in card-elevated p-8">
          <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Password updated</h1>
          <p className="text-muted-foreground">Redirecting you to sign in…</p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center animate-fade-in card-elevated p-8">
          <div className="h-8 w-8 mx-auto mb-4 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-muted-foreground">Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  if (!validRecovery) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center animate-fade-in card-elevated p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Invalid or expired link</h1>
          <p className="text-muted-foreground mb-4">This password reset link is invalid or has expired.</p>
          <Link to="/forgot-password"><Button variant="outline">Request a new link</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center">
          <img src={techFleetLogo} alt="" className="h-12 w-12 mx-auto mb-4 dark:invert" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Set your new password</h1>
        </div>

        <div className="card-elevated p-6 sm:p-8">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="new-password" type={showPassword ? "text" : "password"} placeholder="Enter new password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" autoComplete="new-password" required aria-required="true" aria-describedby="pw-requirements" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <ul id="pw-requirements" className="space-y-1 text-xs" aria-label="Password requirements">
                {passwordRequirements.map(({ label, test }) => {
                  const met = password.length > 0 && test(password);
                  return (
                    <li key={label} className={`flex items-center gap-1.5 ${met ? "text-success" : "text-muted-foreground"}`}>
                      {met ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      {label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Circle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
