import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoaded } = useAuth();
  const location = useLocation();

  if (loading) {
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

  // Wait for the initial profile fetch before making routing decisions
  if (!profileLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" role="status">
          <span className="sr-only">Loading profile…</span>
        </div>
      </div>
    );
  }

  // Redirect to profile setup if profile isn't complete (unless already on that page)
  if (profile && !profile.profile_completed && location.pathname !== "/profile-setup") {
    return <Navigate to="/profile-setup" replace />;
  }

  // If no profile exists at all, also send to setup
  if (!profile && location.pathname !== "/profile-setup") {
    return <Navigate to="/profile-setup" replace />;
  }

  return <>{children}</>;
}
