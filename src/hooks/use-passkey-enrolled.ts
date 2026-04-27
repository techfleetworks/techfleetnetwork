import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PASSKEY_ENROLLMENT_CHANGED_EVENT } from "@/lib/passkey-events";
import { useQueryClient } from "@/lib/react-query";
import { queryKeys } from "@/lib/query-config";

const PASSKEY_ENROLLMENT_TIMEOUT_MS = 8_000;
const PASSKEY_ENROLLMENT_RETRY_DELAYS_MS = [300, 900, 1_800] as const;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Returns true once the current admin user has at least one enrolled passkey.
 * Used to gate /admin routes with WebAuthn MFA.
 */
export function usePasskeyEnrolled() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setEnrolled(null);
      return;
    }
    const checkEnrollment = async () => {
      setEnrolled(null);
      for (let attempt = 0; attempt <= PASSKEY_ENROLLMENT_RETRY_DELAYS_MS.length; attempt += 1) {
        const timeout = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Passkey enrollment check timed out")), PASSKEY_ENROLLMENT_TIMEOUT_MS);
        });
        try {
          const result = await Promise.race([
            supabase
              .from("passkey_credentials")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .neq("device_name", "_pending_challenge"),
            timeout,
          ]) as { count: number | null; error: Error | null };

          if (cancelled) return;
          if (result.error) throw result.error;
          const hasPasskey = (result.count ?? 0) > 0;
          setEnrolled(hasPasskey);
          queryClient.setQueryData(queryKeys.passkeyEnrollment(user.id), hasPasskey);
          return;
        } catch (error) {
          if (cancelled) return;
          console.warn("Passkey enrollment check failed", error);
          const retryDelay = PASSKEY_ENROLLMENT_RETRY_DELAYS_MS[attempt];
          if (retryDelay) {
            await wait(retryDelay);
            continue;
          }
          const cached = queryClient.getQueryData<boolean>(queryKeys.passkeyEnrollment(user.id));
          setEnrolled((current) => current === true || cached === true ? true : null);
          return;
        }
      }
    };
    void checkEnrollment();
    window.addEventListener(PASSKEY_ENROLLMENT_CHANGED_EVENT, checkEnrollment);
    return () => {
      cancelled = true;
      window.removeEventListener(PASSKEY_ENROLLMENT_CHANGED_EVENT, checkEnrollment);
    };
  }, [queryClient, user]);

  return enrolled;
}
