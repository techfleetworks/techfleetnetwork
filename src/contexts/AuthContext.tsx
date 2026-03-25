import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { AuthService } from "@/services/auth.service";
import { ProfileService, type Profile } from "@/services/profile.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const data = await ProfileService.fetch(userId);
    // Only update profile if we got data — never null-out an existing profile during re-fetches
    if (data) {
      setProfile(data);
    }
    setProfileLoaded(true);
    return data;
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
            if (!sessionStorage.getItem("session_started_at")) {
              sessionStorage.setItem("session_started_at", Date.now().toString());

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
                setTimeout(() => {
                  window.location.replace(storedRedirect);
                }, 100);
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

    AuthService.getSession().then((session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

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

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
