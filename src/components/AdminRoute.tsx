import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

/**
 * Route guard that requires both authentication AND admin role.
 * Redirects non-admins to /dashboard with a toast notification.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, profileLoaded } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const location = useLocation();
  const toastShown = useRef(false);

  const showAccessDenied = !authLoading && !adminLoading && profileLoaded && user && !isAdmin;

  useEffect(() => {
    if (showAccessDenied && !toastShown.current) {
      toastShown.current = true;
      toast.error("Access denied. Admin privileges required.");
    }
  }, [showAccessDenied]);

  if (authLoading || adminLoading || !profileLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" role="status">
          <span className="sr-only">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
