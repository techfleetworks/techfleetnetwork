/**
 * Server-side helper: is this user "elevated" (must pass authenticator 2FA gate)?
 *
 * Today: admin only.
 * Tomorrow: extend by editing the SQL function `public.is_elevated(uuid)` —
 * no code changes required here.
 *
 * This module exists so client-callable code does not have to know which
 * roles count as elevated.
 */
import { getAdminClient } from "./admin-client.ts";

export async function isElevatedUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("is_elevated", { _user_id: userId });
    if (error) {
      console.error(JSON.stringify({ level: "error", action: "is_elevated_check", error: error.message }));
      return false;
    }
    return data === true;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", action: "is_elevated_check", error: String(err) }));
    return false;
  }
}
