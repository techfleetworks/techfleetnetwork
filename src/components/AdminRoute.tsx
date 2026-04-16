import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { usePasskeyEnrolled } from "@/hooks/use-passkey-enrolled";
import { toast } from "sonner";
import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";
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
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  if (passkeyEnrolled === false) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4 rounded-lg border bg-card p-6">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Passkey required for admin access</h1>
          <p className="text-sm text-muted-foreground">
            For security, all admin accounts must enroll a passkey (Face ID, Touch ID, Windows Hello, or hardware key) before accessing the admin area.
          </p>
          <Button asChild>
            <Link to="/profile/edit?tab=account">Enroll a passkey</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
