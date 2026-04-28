import { Link, useLocation } from "react-router-dom";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { MfaService } from "@/services/mfa.service";
import { useEffect, useState } from "react";

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
  const [hasTotp, setHasTotp] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    if (!user || !isAdmin) {
      setHasTotp(null);
      return;
    }
    void MfaService.hasVerifiedTotp()
      .then((enabled) => { if (!cancelled) setHasTotp(enabled); })
      .catch(() => { if (!cancelled) setHasTotp(null); });
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  if (!user || !profileLoaded || adminLoading) return null;
  if (!isAdmin) return null;
  if (hasTotp !== false) return null; // null = unknown, true = done
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
      aria-label="Admin 2FA setup required"
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
              You're now an admin. Set up Google Authenticator-compatible 2FA within
              your 5-day grace period to keep admin access uninterrupted.
            </p>
          </div>
        </div>
        <Link
          to="/profile/edit?tab=account"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shrink-0"
        >
          Set up 2FA
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
