import { Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useTeacher } from "@/hooks/use-teacher";
import { useMfaGate } from "@/hooks/use-mfa-gate";
import { useQueryClient } from "@/lib/react-query";
import { queryKeys } from "@/lib/query-config";
import { rpcWithTimeout } from "@/lib/db/rpc-with-timeout";
import { reportError } from "@/services/error-reporter.service";
import { signOutSafe } from "@/lib/auth/session-port";
import { MfaChallengeDialog } from "@/components/MfaChallengeDialog";

/**
 * Route guard for the merged Class Admin section (ADR-0063). One entry point for teachers AND admins,
 * so the 2FA policy is role-aware:
 *
 *  - member (neither role)     → /access-denied (the section is never shown to them either).
 *  - admin                     → 2FA MANDATORY. Enrolled + AAL2 ⇒ in. Enrolled + below AAL2 ⇒ hard
 *                                block + challenge. Not enrolled ⇒ setup path with the same grace
 *                                window AdminRoute uses (banner while active, lockout when expired).
 *  - teacher                   → 2FA CONDITIONAL. If the teacher has a verified authenticator, it must
 *                                be satisfied (below AAL2 ⇒ hard block + challenge); if they have none,
 *                                they're allowed straight through (2FA is optional for teachers).
 *
 * Composed entirely from existing exports — it does not modify the frozen auth layer. The actual
 * challenge UI is the shared MfaChallengeDialog (the same one the global MfaEnforcementGuard uses);
 * this guard's job is the ROLE split and HARD-BLOCKING children until 2FA is satisfied (the global
 * guard overlays a dialog but lets children render behind it — here they must not).
 *
 * Enrollment vs. satisfaction come from `useMfaGate()` → `{ hasVerifiedTotp, currentAal, needsChallenge }`
 * where `needsChallenge = hasVerifiedTotp && currentAal !== 'aal2'`.
 *
 * NOTE (told the product owner): route-level 2FA in this app is a client-side control — there is no DB
 * AAL2 backstop on ordinary class/cohort reads. The durable server-side guarantee is authorization
 * (RLS + the owner/admin RPCs). The one destructive path, delete_cohort, does add a backend aal2 check
 * for admin callers (ADR-0063).
 */
function GuardSpinner() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
        role="status"
      >
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}

export function ClassAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, profileLoaded } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { isTeacher, loading: teacherLoading } = useTeacher();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const rolesReady = !authLoading && !adminLoading && !teacherLoading && profileLoaded;
  const roleAllowed = isAdmin || isTeacher;

  const gateEnabled = !!user && roleAllowed;
  const gate = useMfaGate(gateEnabled);
  const mfa = gate.data; // { hasVerifiedTotp, currentAal, needsChallenge } | undefined
  const needsChallenge = !!mfa?.needsChallenge;

  // Admin-only enrollment grace, fetched only when an admin has no authenticator (mirrors AdminRoute).
  const [grace, setGrace] = useState<{ active: boolean | null; deadline: string | null } | null>(
    null
  );
  const adminNeedsEnroll =
    rolesReady && !!user && isAdmin && !!mfa && !mfa.hasVerifiedTotp && !needsChallenge;

  useEffect(() => {
    let cancelled = false;
    if (!adminNeedsEnroll || !user) {
      setGrace(null);
      return;
    }
    void (async () => {
      setGrace(null);
      const [deadlineRes, graceRes] = await Promise.allSettled([
        rpcWithTimeout<string | null>("admin_2fa_grace_deadline", { _user_id: user.id }),
        rpcWithTimeout<boolean>("admin_2fa_grace_active", { _user_id: user.id }),
      ]);
      if (cancelled) return;
      const d = deadlineRes.status === "fulfilled" ? deadlineRes.value : null;
      const g = graceRes.status === "fulfilled" ? graceRes.value : null;
      const timedOut = d?.error?.code === "RPC_TIMEOUT" || g?.error?.code === "RPC_TIMEOUT";
      if (timedOut) {
        reportError("class-admin 2FA grace RPC timed out — failing open", "ClassAdminRoute", {
          eventType: "infra_transient",
          severity: "warn",
          extraFields: ["fingerprint:class_admin_2fa_rpc_timeout"],
        });
      }
      setGrace({
        deadline: d && !d.error ? d.data : null,
        active: g && !g.error ? g.data === true : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [adminNeedsEnroll, user]);

  if (!rolesReady) return <GuardSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!roleAllowed) {
    return (
      <Navigate
        to="/access-denied"
        state={{
          from: location,
          reason:
            "Class Admin is available to teachers and admins. You can continue using the rest of Tech Fleet Network normally.",
        }}
        replace
      />
    );
  }

  // Gate decision not resolved yet — never render children (or admin-enroll UI) on an unknown 2FA state.
  if (!mfa) return <GuardSpinner />;

  // Enrolled but the session is below AAL2 → hard block and challenge (admin AND teacher).
  if (needsChallenge) {
    return (
      <>
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4 rounded-lg border bg-card p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold">Two-factor verification required</h1>
            <p className="text-sm text-muted-foreground">
              Enter the code from your authenticator to open Class Admin. You won't see or change
              anything until you verify.
            </p>
          </div>
        </div>
        <MfaChallengeDialog
          open
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.mfaGate(user.id) });
          }}
          onCancel={async () => {
            await signOutSafe({ scope: "global", reason: "mfa_refused" });
            navigate("/login", { replace: true });
          }}
        />
      </>
    );
  }

  // Admin without an authenticator enrolled → mandatory setup, with AdminRoute's grace behavior.
  if (isAdmin && !mfa.hasVerifiedTotp) {
    if (grace === null) return <GuardSpinner />;

    if (grace.active === false) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4 rounded-lg border bg-card p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold">Admin 2FA setup required</h1>
            <p className="text-sm text-muted-foreground">
              Admin access to Class Admin requires a Google Authenticator-compatible 2FA code. Set
              it up from your account settings to continue.
            </p>
            <Button asChild>
              <Link to="/profile/edit?tab=account">Set up 2FA</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              You can keep using the rest of Tech Fleet Network normally in the meantime.
            </p>
          </div>
        </div>
      );
    }

    if (grace.active === true) {
      return (
        <>
          <div className="border-b border-primary/30 bg-primary/10">
            <div className="container-app flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 text-sm">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-foreground">Admin 2FA setup grace period</p>
                  <p className="text-muted-foreground">
                    Set up Google Authenticator-compatible 2FA before{" "}
                    {grace.deadline
                      ? new Date(grace.deadline).toLocaleDateString()
                      : "the deadline"}{" "}
                    to keep admin access uninterrupted.
                  </p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link to="/profile/edit?tab=account">Set up 2FA</Link>
              </Button>
            </div>
          </div>
          {children}
        </>
      );
    }
    // grace.active === null → grace RPCs failed/timed out; fail open to children (matches AdminRoute).
  }

  return <>{children}</>;
}
