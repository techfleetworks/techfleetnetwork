import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacher } from "@/hooks/use-teacher";
import { useAdmin } from "@/hooks/use-admin";

/**
 * Route guard for class-authoring surfaces.
 * Allows users with either the `teacher` or `admin` role.
 * Mirrors AdminRoute UX (loading spinner, access-denied redirect).
 */
export function TeacherRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, profileLoaded } = useAuth();
  const { isTeacher, loading: teacherLoading } = useTeacher();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const location = useLocation();
  const toastShown = useRef(false);

  const ready = !authLoading && !teacherLoading && !adminLoading && profileLoaded;
  const allowed = isTeacher || isAdmin;

  useEffect(() => {
    if (ready && user && !allowed && !toastShown.current) {
      toastShown.current = true;
      toast.error("Access denied. Teacher privileges required.");
    }
  }, [ready, user, allowed]);

  if (!ready) {
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

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!allowed) {
    return (
      <Navigate
        to="/access-denied"
        state={{
          from: location,
          reason:
            "Teacher access is required for this page. Ask an admin to promote you to a teacher.",
        }}
        replace
      />
    );
  }

  return <>{children}</>;
}
