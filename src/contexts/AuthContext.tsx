import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { isSafeRedirectUrl } from "@/lib/security";
import { AuthService } from "@/services/auth.service";
import { ProfileService, type Profile } from "@/services/profile.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { clearOAuthUiMarker, hasFreshOAuthUiMarker, isRootOAuthCallback, stripRootOAuthCallbackUrl } from "@/lib/oauth-ui-guard";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoaded: boolean;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Stash the context on globalThis so HMR re-imports of this module reuse the
// SAME context instance. Without this, Vite's hot-reload can produce two
// distinct React contexts in memory: AuthProvider writes to one, useAuth reads
// from the other, and consumers throw "useAuth must be used within AuthProvider"
// — surfaced to users as "authorization failed" on the login screen.
const GLOBAL_KEY = "__tfn_auth_context__";
const GLOBAL_VALUE_KEY = "__tfn_auth_context_value__";
const SESSION_STARTED_AT_KEY = "session_started_at";
type GlobalWithCtx = typeof globalThis & {
  [GLOBAL_KEY]?: React.Context<AuthContextType | undefined>;
  [GLOBAL_VALUE_KEY]?: AuthContextType;
};
const g = globalThis as GlobalWithCtx;
const existingAuthCtx = g[GLOBAL_KEY];
const freshAuthCtx = existingAuthCtx ?? createContext<AuthContextType | undefined>(undefined);

// Dev-time duplicate-context detector: surfaces HMR module duplication
// instantly instead of letting it silently break auth for users.
if (import.meta.env?.DEV && existingAuthCtx && existingAuthCtx !== freshAuthCtx) {
  throw new Error(
    "[AuthContext] Duplicate context instance detected on globalThis. " +
      "This usually means HMR loaded two copies of AuthContext.tsx. " +
      "Check for non-canonical import paths (must be @/contexts/AuthContext)."
  );
}

const AuthContext: React.Context<AuthContextType | undefined> = freshAuthCtx;
g[GLOBAL_KEY] = AuthContext;

function isInvalidRefreshTokenAuthError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return message.includes("refresh token") &&
    (message.includes("invalid") ||
      message.includes("not found") ||
      message.includes("missing") ||
      message.includes("expired") ||
      message.includes("revoked") ||
      message.includes("already used") ||
      message.includes("reuse"));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const data = await ProfileService.fetch(userId);
      // Only update profile if we got data — never null-out an existing profile during re-fetches
      if (data) {
        setProfile(data);
      }
      return data;
    } catch {
      return null;
    } finally {
      setProfileLoaded(true);
    }
  }, []);

  /** For Google OAuth users, sync their Google metadata to the profile if names are empty */
  const syncOAuthProfile = useCallback(async (currentUser: User, currentProfile: Profile | null) => {
    if (!currentProfile) return;
    const meta = currentUser.user_metadata;
    if (!meta) return;

    const needsNameSync = !currentProfile.first_name || !currentProfile.last_name;
    const needsEmailSync = !currentProfile.email && currentUser.email;

    if (!needsNameSync && !needsEmailSync) return;

    const firstName = meta.given_name || meta.first_name || "";
    const lastName = meta.family_name || meta.last_name || "";

    if (!needsNameSync && needsEmailSync) {
      try {
        await ProfileService.updateNames(currentUser.id, currentProfile.first_name, currentProfile.last_name, currentUser.email);
        await fetchProfile(currentUser.id);
      } catch { /* Non-critical */ }
      return;
    }

    if (!firstName && !lastName && !needsEmailSync) return;

    try {
      await ProfileService.updateNames(currentUser.id, firstName, lastName, currentUser.email || undefined);
      await fetchProfile(currentUser.id);
    } catch {
      // Non-critical
    }
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = AuthService.onAuthStateChange(
      async (_event, session) => {
        if (_event === "SIGNED_OUT") {
          AuthService.clearLocalAuthState();
        }

        if (_event === "SIGNED_IN" && isRootOAuthCallback() && !hasFreshOAuthUiMarker()) {
          AuthService.clearLocalAuthState();
          stripRootOAuthCallbackUrl();
          await AuthService.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          setProfileLoaded(false);
          setLoading(false);
          return;
        }

        // For token refreshes, only update session/user if the user ID actually changed
        if (_event === "TOKEN_REFRESHED") {
          setSession((prev) => {
            if (prev?.access_token === session?.access_token) return prev;
            return session;
          });
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          if (_event === "SIGNED_IN") {
            if (isRootOAuthCallback()) {
              clearOAuthUiMarker();
              stripRootOAuthCallbackUrl();
            }
            if (!sessionStorage.getItem(SESSION_STARTED_AT_KEY)) {
              sessionStorage.setItem(
                SESSION_STARTED_AT_KEY,
                JSON.stringify({ version: 1, userId: session.user.id, startedAtMs: Date.now() }),
              );

              const createdAt = session.user.created_at ? new Date(session.user.created_at).getTime() : 0;
              const isNewAccount = Date.now() - createdAt < 2 * 60 * 1000;
              if (isNewAccount) {
                const meta = session.user.user_metadata;
                const name = meta?.full_name || meta?.first_name || session.user.email || "Someone";
                DiscordNotifyService.userSignedUp(name);
              }

              const storedRedirect = sessionStorage.getItem("auth_redirect");
              if (storedRedirect) {
                sessionStorage.removeItem("auth_redirect");
                // WSTG-CLNT-04: Validate redirect target to prevent open redirect
                if (isSafeRedirectUrl(storedRedirect)) {
                  setTimeout(() => {
                    window.location.replace(storedRedirect);
                  }, 100);
                }
              }
            }
          }
          setTimeout(async () => {
            const p = await fetchProfile(session.user.id);
            if (_event === "SIGNED_IN") {
              await syncOAuthProfile(session.user, p);
            }
          }, 0);
        } else {
          setProfile(null);
          setProfileLoaded(false);
        }
        setLoading(false);
      }
    );

    AuthService.getSession()
      .then((session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          void fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setProfileLoaded(false);
        }
      })
      .catch((error) => {
        if (isInvalidRefreshTokenAuthError(error)) {
          AuthService.clearLocalAuthState();
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileLoaded(false);
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, [fetchProfile, syncOAuthProfile]);

  const signOut = useCallback(async () => {
    await AuthService.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileLoaded(false);
  }, []);

  const signOutAllDevices = useCallback(async () => {
    await AuthService.signOutAllDevices();
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileLoaded(false);
  }, []);

  const contextValue = useMemo(
    () => ({ user, session, profile, loading, profileLoaded, signOut, signOutAllDevices, refreshProfile }),
    [user, session, profile, loading, profileLoaded, signOut, signOutAllDevices, refreshProfile]
  );

  // Resolve the canonical context from globalThis at render time so HMR can't
  // make AuthProvider write to a different instance than useAuth reads from.
  const Canonical = (globalThis as GlobalWithCtx)[GLOBAL_KEY] ?? AuthContext;
  (globalThis as GlobalWithCtx)[GLOBAL_VALUE_KEY] = contextValue;
  return (
    <Canonical.Provider value={contextValue}>
      {children}
    </Canonical.Provider>
  );
}

export function useAuth() {
  // Always resolve the context from globalThis at call time. This guarantees we
  // read from the SAME context instance the AuthProvider is writing to, even
  // after Vite HMR re-evaluates one of the modules involved.
  const globals = globalThis as GlobalWithCtx;
  const canonical = globals[GLOBAL_KEY] ?? AuthContext;
  const ctx = useContext(canonical) ?? globals[GLOBAL_VALUE_KEY];
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
