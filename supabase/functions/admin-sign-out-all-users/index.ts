import { requireFreshAdmin2fa } from "../_shared/admin-step-up.ts";
import { getAdminClient } from "../_shared/admin-client.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { requireAdminRequest } from "../_shared/request-auth.ts";
import { normalizeRevocationUsers, toSafeSignOutFailures } from "./validation.ts";

const log = createEdgeLogger("admin-sign-out-all-users");
const MAX_LIST_PAGES = 100;
const USERS_PER_PAGE = 1000;

type AdminClient = ReturnType<typeof getAdminClient>;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAdminRequest(req);
    if (auth instanceof Response) return auth;

    const admin = getAdminClient();
    const stepUp = await requireFreshAdmin2fa(admin, auth.authHeader, auth.userId, 10);
    if (!stepUp.ok) return jsonResponse({ error: stepUp.error }, stepUp.status);

    const users = await listAllAuthUsers(admin);
    const revokedAt = new Date().toISOString();
    const revocations = users.map((user) => ({
      user_id: user.id,
      reason: "emergency_global_signout",
      revoked_by: auth.userId,
      revoked_at: revokedAt,
    }));

    if (revocations.length > 0) {
      const { error } = await admin.from("revoked_sessions").insert(revocations);
      if (error) {
        log.error("revocation_insert_failed", "Failed to insert emergency session revocations", { count: revocations.length }, error);
        return jsonResponse({ error: "Failed to record session revocations" }, 500);
      }
    }

    const failures: Array<{ user_id: string; error?: unknown }> = [];
    for (const user of users) {
      const { error } = await admin.auth.admin.signOut(user.id, "global");
      if (error) failures.push({ user_id: user.id, error: error.message });
    }

    const safeFailures = toSafeSignOutFailures(failures);
    await writeAuditLog(admin, auth.userId, users.length, safeFailures.length, revokedAt, safeFailures);

    log.info("global_signout_completed", "Emergency global sign-out completed", {
      usersRevoked: users.length,
      failures: safeFailures.length,
    });

    return jsonResponse({
      success: safeFailures.length === 0,
      users_revoked: users.length,
      failures: safeFailures,
    });
  } catch (error) {
    log.error("global_signout_failed", "Emergency global sign-out failed", undefined, error);
    return errorResponse(error, "Emergency sign-out failed");
  }
});

async function listAllAuthUsers(admin: AdminClient): Promise<Array<{ id: string }>> {
  const users: unknown[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) {
      log.error("auth_user_list_failed", "Failed to list users for emergency sign-out", { page }, error);
      throw new Error("Unable to list users for emergency sign-out");
    }
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < USERS_PER_PAGE) break;
  }
  return normalizeRevocationUsers(users);
}

async function writeAuditLog(
  admin: AdminClient,
  adminUserId: string,
  userCount: number,
  failureCount: number,
  revokedAt: string,
  safeFailures: Array<{ user_id: string; code: string }>,
) {
  const { error } = await admin.rpc("write_audit_log", {
    p_event_type: "emergency_global_signout",
    p_table_name: "auth.users",
    p_record_id: null,
    p_user_id: adminUserId,
    p_changed_fields: [`users:${userCount}`, `failures:${failureCount}`, `revoked_at:${revokedAt}`],
    p_error_message: failureCount ? JSON.stringify(safeFailures) : null,
  });

  if (error) {
    log.warn("audit_log_failed", "Audit log write failed for emergency global sign-out", { userCount, failureCount }, error);
  }
}
