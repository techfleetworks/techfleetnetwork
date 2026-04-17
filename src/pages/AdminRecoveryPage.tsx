import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { PasskeyLoginService } from "@/services/passkey-login.service";

/**
 * Lands here when an admin clicks the recovery link in their email.
 * Validates the token against their currently-authenticated session and
 * redirects to /dashboard on success.
 */
export default function AdminRecoveryPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [state, setState] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    document.title = "Admin recovery • Tech Fleet Network";
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Not signed in yet — bounce to login, return here after auth
      navigate(`/login?redirect=${encodeURIComponent(`/admin-recovery?token=${token}`)}`, { replace: true });
      return;
    }
    if (!token || token.length < 32) {
      setState("error");
      setError("This recovery link is missing or malformed.");
      return;
    }
    setState("verifying");
    PasskeyLoginService.consumeRecoveryToken(token)
      .then(() => {
        setState("success");
        setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
      })
      .catch((e) => {
        setState("error");
        setError(e instanceof Error ? e.message : "Recovery failed");
      });
  }, [loading, user, token, navigate]);

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-lg border bg-card p-8 text-center space-y-4">
        {state === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" aria-hidden="true" />
            <h1 className="text-xl font-semibold">Verifying your recovery link…</h1>
            <p className="text-sm text-muted-foreground">This will only take a moment.</p>
          </>
        )}
        {state === "success" && (
          <>
            <ShieldCheck className="h-10 w-10 mx-auto text-primary" aria-hidden="true" />
            <h1 className="text-xl font-semibold">Verified — redirecting…</h1>
            <p className="text-sm text-muted-foreground">Taking you back to your dashboard.</p>
          </>
        )}
        {state === "error" && (
          <>
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" aria-hidden="true" />
            <h1 className="text-xl font-semibold">Recovery link invalid</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => navigate("/dashboard")} className="mt-2">Back to dashboard</Button>
          </>
        )}
      </section>
    </main>
  );
}
