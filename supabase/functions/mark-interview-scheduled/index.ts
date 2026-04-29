/**
 * mark-interview-scheduled — Edge Function
 *
 * Called by applicants to mark their interview as scheduled.
 * Updates applicant_status to 'interview_scheduled' and sends
 * an in-app notification to the admin who invited them.
 */

import { errorResponse, handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/admin-client.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { escapeHtml, parseMarkInterviewScheduledRequest, toSafeNotificationText } from "./validation.ts";

const log = createEdgeLogger("mark-interview-scheduled");
const VALID_FROM_STATUSES = new Set(["invited_to_interview"]);

type SupabaseClientLike = ReturnType<typeof getAdminClient>;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) return auth;

    const parsed = parseMarkInterviewScheduledRequest(await parseJsonBody(req, 1024));
    if (parsed instanceof Response) return parsed;

    const supabase = getAdminClient();
    const applicationId = parsed.application_id;

    const { data: application, error: appError } = await supabase
      .from("project_applications")
      .select("id, user_id, applicant_status, project_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return jsonResponse({ error: "Application not found" }, 404);
    }

    if (application.user_id !== auth.userId) {
      log.warn("ownership_denied", "Applicant attempted to update an application they do not own", { applicationId });
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (!VALID_FROM_STATUSES.has(String(application.applicant_status))) {
      return jsonResponse({ error: "Cannot mark as scheduled from current status" }, 400);
    }

    const { error: updateError } = await supabase
      .from("project_applications")
      .update({ applicant_status: "interview_scheduled" })
      .eq("id", applicationId)
      .eq("user_id", auth.userId)
      .eq("applicant_status", "invited_to_interview");

    if (updateError) {
      log.error("status_update_failed", "Failed to update applicant interview status", { applicationId }, updateError);
      return jsonResponse({ error: "Failed to update status" }, 500);
    }

    const adminUserId = await resolveAdminUserId(supabase, application.project_id, applicationId, auth.userId);
    const { applicantName, clientName } = await resolveNotificationNames(supabase, auth.userId, application.project_id);

    await notifyAdmins({ supabase, adminUserId, applicationId, applicantName, clientName });
    await writeAuditLog(supabase, applicationId, auth.userId);

    return jsonResponse({ success: true });
  } catch (error) {
    log.error("unexpected_error", "Interview scheduling request failed", undefined, error);
    return errorResponse(error, "Interview scheduling failed");
  }
});

async function resolveAdminUserId(
  supabase: SupabaseClientLike,
  projectId: string | null,
  applicationId: string,
  callerUserId: string,
): Promise<string | null> {
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("coordinator_id")
      .eq("id", projectId)
      .single();
    if (project?.coordinator_id) return project.coordinator_id;
  }

  const { data: auditEntries } = await supabase
    .from("audit_log")
    .select("user_id")
    .eq("table_name", "project_applications")
    .eq("record_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(20);

  return auditEntries?.find((entry: { user_id?: string | null }) => entry.user_id && entry.user_id !== callerUserId)?.user_id ?? null;
}

async function resolveNotificationNames(
  supabase: SupabaseClientLike,
  userId: string,
  projectId: string | null,
): Promise<{ applicantName: string; clientName: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", userId)
    .single();

  const applicantName = toSafeNotificationText(
    profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
    "An applicant",
  );

  let clientName = "a project";
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .single();
    if (project?.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", project.client_id)
        .single();
      clientName = toSafeNotificationText(client?.name, "a project");
    }
  }

  return { applicantName, clientName };
}

async function notifyAdmins(params: {
  supabase: SupabaseClientLike;
  adminUserId: string | null;
  applicationId: string;
  applicantName: string;
  clientName: string;
}) {
  const { supabase, adminUserId, applicationId, applicantName, clientName } = params;
  const notifTitle = `📅 Interview Scheduled — ${applicantName}`;
  const notifBody = `<p><strong>${escapeHtml(applicantName)}</strong> has indicated they have scheduled their interview for the <strong>${escapeHtml(clientName)}</strong> project.</p>`;

  async function safeNotify(userId: string) {
    const { error } = await supabase.rpc("safe_create_notification", {
      p_user_id: userId,
      p_title: notifTitle,
      p_body_html: notifBody,
      p_notification_type: "interview_scheduled",
      p_link_url: "/admin/roster",
      p_source: "mark-interview-scheduled",
    });
    if (error) log.error("notification_enqueue_failed", "Failed to enqueue interview notification", { targetUserId: userId }, error);
  }

  if (adminUserId) {
    await safeNotify(adminUserId);
    log.info("admin_notification_queued", "Interview notification queued for project admin", { targetUserId: adminUserId });
    return;
  }

  log.warn("admin_resolution_failed", "No specific admin found; using admin role fallback", { applicationId });
  try {
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(100);
    await Promise.all((adminRoles ?? []).map((role: { user_id: string }) => safeNotify(role.user_id)));
    log.info("admin_fallback_notifications_queued", "Interview notifications queued for fallback admins", { count: adminRoles?.length ?? 0 });
  } catch (error) {
    log.error("admin_fallback_failed", "Fallback admin notification failed", { applicationId }, error);
  }
}

async function writeAuditLog(supabase: SupabaseClientLike, applicationId: string, userId: string) {
  try {
    await supabase.rpc("write_audit_log", {
      p_event_type: "applicant_marked_interview_scheduled",
      p_table_name: "project_applications",
      p_record_id: applicationId,
      p_user_id: userId,
      p_changed_fields: ["interview_scheduled"],
    });
  } catch (error) {
    log.warn("audit_log_failed", "Audit log write failed for interview scheduling", { applicationId }, error);
  }
}
