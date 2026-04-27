import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PASSKEY_ENROLLMENT_CHANGED_EVENT } from "@/lib/passkey-events";

const PASSKEY_ENROLLMENT_TIMEOUT_MS = 8_000;

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
    const checkEnrollment = async () => {
      setEnrolled(null);
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Passkey enrollment check timed out")), PASSKEY_ENROLLMENT_TIMEOUT_MS);
      });
      const { count, error } = await Promise.race([
        supabase
          .from("passkey_credentials")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .neq("device_name", "_pending_challenge"),
        timeout,
      ]);
      if (cancelled) return;
      if (error) {
        console.warn("Passkey enrollment check failed", error);
        setEnrolled(false);
        return;
      }
      setEnrolled((count ?? 0) > 0);
    };
    void checkEnrollment();
    window.addEventListener(PASSKEY_ENROLLMENT_CHANGED_EVENT, checkEnrollment);
    return () => {
      cancelled = true;
      window.removeEventListener(PASSKEY_ENROLLMENT_CHANGED_EVENT, checkEnrollment);
    };
  }, [user]);

  return enrolled;
}
