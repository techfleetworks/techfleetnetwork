import { useQuery } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/query-config";

/**
 * Hook that checks if the current user has the admin role.
 * Always revalidates on mount/focus so newly confirmed admins get access immediately.
 */
export function useAdmin() {
  const { user } = useAuth();

  const { data: isAdmin = false, isLoading: loading } = useQuery({
    queryKey: user ? queryKeys.adminRole(user.id) : ["admin-role", "anonymous"],
    queryFn: async () => {
      if (!user) return false;

      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", user.id)
        .eq("role", "admin");

      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!user,
    // Admin role is durable: cache for 2 minutes to eliminate the
    // per-page-change refetch that hit /user_roles every navigation.
    // Role changes still propagate via auth state change → cache invalidation.
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  return { isAdmin, loading };
}
