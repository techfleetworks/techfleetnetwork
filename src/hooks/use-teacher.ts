import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns whether the current user holds the teacher role.
 * Mirrors use-admin caching behavior — role is durable for the session.
 */
export function useTeacher() {
  const { user } = useAuth();
  const { data: isTeacher = false, isLoading: loading } = useQuery({
    queryKey: user ? (["teacher-role", user.id] as const) : (["teacher-role", "anonymous"] as const),
    queryFn: async () => {
      if (!user) return false;
      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", user.id)
        .eq("role", "teacher");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
  return { isTeacher, loading };
}
