import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook that checks if the current user has the admin role.
 * Uses the server-side has_role function to avoid RLS recursion.
 */
export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function checkAdmin() {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", user!.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!cancelled) {
          setIsAdmin(!!data);
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkAdmin();
    return () => { cancelled = true; };
  }, [user]);

  return { isAdmin, loading };
}
