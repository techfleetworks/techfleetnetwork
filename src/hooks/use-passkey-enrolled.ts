import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true once the current admin user has at least one enrolled passkey.
 * Used to gate /admin routes with WebAuthn MFA.
 */
export function usePasskeyEnrolled() {
  const { user } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEnrolled(null);
      return;
    }
    (async () => {
      const { count, error } = await supabase
        .from("passkey_credentials")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("device_name", "_pending_challenge");
      if (!cancelled) setEnrolled(!error && (count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return enrolled;
}
