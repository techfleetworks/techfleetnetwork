import { Link, useLocation } from "react-router-dom";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { usePasskeyEnrolled } from "@/hooks/use-passkey-enrolled";

/**
 * App-wide nudge for admins who have NOT yet enrolled a passkey.
 *
 * Why this exists:
 *   When a user is promoted to admin, the only signal they currently get is the
 *   AdminRoute wall when they happen to click into /admin/*. That's easy to
 *   misread as "you can't log in." This banner makes the one-time security
 *   setup proactive and obvious so they can self-serve without admin help.
 *
 * Visibility rules:
 *   - Only renders for authenticated admins with zero passkeys enrolled.
 *   - Hidden on the page where they enroll (/profile/edit) so it doesn't
 *     overlap the actual setup card and create visual noise.
 *   - Hidden on auth pages (/login, /register, /reset-password) because
 *     `useAdmin` won't be settled there anyway.
 */
export function AdminPasskeySetupBanner() {
  const { user, profileLoaded } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const passkeyEnrolled = usePasskeyEnrolled();
  const location = useLocation();

  if (!user || !profileLoaded || adminLoading) return null;
  if (!isAdmin) return null;
  if (passkeyEnrolled !== false) return null; // null = unknown, true = done
  if (location.pathname.startsWith("/profile/edit")) return null;
  if (
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register") ||
    location.pathname.startsWith("/reset-password") ||
    location.pathname.startsWith("/forgot-password")
  ) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Admin passkey setup required"
      className="border-b border-primary/30 bg-primary/10"
    >
      <div className="container-app flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">
              Finish your admin security setup
            </p>
            <p className="text-muted-foreground">
              You're now an admin. Add a passkey (Face ID, Touch ID, Windows Hello, or
              a hardware key) to unlock the admin area. This is a one-time step you
              can do yourself in under a minute.
            </p>
          </div>
        </div>
        <Link
          to="/profile/edit?tab=account"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shrink-0"
        >
          Set up passkey
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
