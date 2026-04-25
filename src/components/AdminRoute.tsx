import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { usePasskeyEnrolled } from "@/hooks/use-passkey-enrolled";
import { toast } from "sonner";
import { useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route guard requiring authentication, admin role, AND at least one enrolled passkey (MFA).
 * Non-admins are redirected to /dashboard. Admins without a passkey see an inline enrollment prompt.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, profileLoaded } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const passkeyEnrolled = usePasskeyEnrolled();
  const location = useLocation();
  const toastShown = useRef(false);

  const showAccessDenied = !authLoading && !adminLoading && profileLoaded && user && !isAdmin;

  useEffect(() => {
    if (showAccessDenied && !toastShown.current) {
      toastShown.current = true;
      toast.error("Access denied. Admin privileges required.");
    }
  }, [showAccessDenied]);

  if (authLoading || adminLoading || !profileLoaded || (isAdmin && passkeyEnrolled === null)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" role="status">
          <span className="sr-only">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdmin) {
    return (
      <Navigate
        to="/access-denied"
        state={{
          from: location,
          reason: "Admin access is required for this page. You can continue using the rest of Tech Fleet Network normally.",
        }}
        replace
      />
    );
  }

  if (passkeyEnrolled === false) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4 rounded-lg border bg-card p-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">One-time admin security setup</h1>
          <p className="text-sm text-muted-foreground">
            You're signed in as an admin — there's no login problem. Before you can open
            the admin area, please add a passkey (Face ID, Touch ID, Windows Hello, or a
            hardware key). It takes about 30 seconds and you only do it once per device.
          </p>
          <Button asChild>
            <Link to="/profile/edit?tab=account">Set up my passkey</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            You can keep using the rest of Tech Fleet Network normally in the meantime.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
