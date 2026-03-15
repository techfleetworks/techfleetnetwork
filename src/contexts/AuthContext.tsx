import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AuthService } from "@/services/auth.service";
import { ProfileService, type Profile } from "@/services/profile.service";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const data = await ProfileService.fetch(userId);
    setProfile(data);
    return data;
  };

  /** For Google OAuth users, sync their Google metadata to the profile if names are empty */
  const syncOAuthProfile = async (currentUser: User, currentProfile: Profile | null) => {
    if (!currentProfile) return;
    const meta = currentUser.user_metadata;
    if (!meta) return;
    // Only sync if profile names are empty (first login via OAuth)
    if (currentProfile.first_name || currentProfile.last_name) return;

    const firstName = meta.given_name || meta.first_name || "";
    const lastName = meta.family_name || meta.last_name || "";
    if (!firstName && !lastName) return;

    try {
      await ProfileService.updateNames(currentUser.id, firstName, lastName);
      await fetchProfile(currentUser.id);
    } catch {
      // Non-critical, profile setup will catch missing data
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = AuthService.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(async () => {
            const p = await fetchProfile(session.user.id);
            if (_event === "SIGNED_IN") {
              await syncOAuthProfile(session.user, p);
            }
          }, 0);
        } else {
          setProfile(null);
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
  }, []);

  const signOut = async () => {
    await AuthService.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
