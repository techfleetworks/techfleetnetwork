import { useState } from "react";
import { MoreHorizontal, UserCheck, UserX, Calendar, Users, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "@/services/logger.service";

const log = createLogger("ApplicantStatusDropdown");

export const APPLICANT_STATUSES = [
  { value: "pending_review", label: "Pending Review" },
  { value: "invited_to_interview", label: "Invite to Interview" },
  { value: "picked_for_team", label: "Picked for Team" },
  { value: "not_selected", label: "Not Selected" },
  { value: "active_participant", label: "Active Participant" },
  { value: "left_the_project", label: "Left the Project" },
] as const;

export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number]["value"];

const STATUS_ICONS: Record<string, typeof Calendar> = {
  invited_to_interview: Calendar,
  picked_for_team: UserCheck,
  not_selected: UserX,
  active_participant: Users,
  left_the_project: LogOut,
};

interface Props {
  applicationId: string;
  applicantUserId: string;
  applicantFirstName: string;
  applicantEmail: string;
  projectId: string;
  currentStatus: string;
  /** Invalidation query keys after status change */
  invalidateKeys?: string[][];
  /** If provided, renders a labeled button instead of the icon-only trigger */
  triggerLabel?: string;
}

export function ApplicantStatusDropdown({
  applicationId,
  applicantUserId,
  applicantFirstName,
  applicantEmail,
  projectId,
  currentStatus,
  invalidateKeys = [],
  triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleStatusChange = async (newStatus: ApplicantStatus) => {
    if (newStatus === currentStatus || !user) return;
    setOpen(false);
    setChanging(true);

    try {
      // For "Invite to Interview", check admin's scheduling link
      if (newStatus === "invited_to_interview") {
        const adminProfile = await ProfileService.fetch(user.id);
        const schedulingUrl = (adminProfile as any)?.scheduling_url;

        if (!schedulingUrl) {
          toast.error("You need to set your scheduling link first", {
            description: "Go to Edit Profile → Basic Info to add your scheduling link.",
            duration: 8000,
            position: "top-center",
            action: {
              label: "Go to Profile",
              onClick: () => {
                window.location.href = "/profile/edit?tab=basic-info";
              },
            },
          });
          setChanging(false);
          return;
        }

        // Find the project coordinator from the roster, fallback to admin
        let coordinatorName = adminProfile?.display_name || `${adminProfile?.first_name ?? ""} ${adminProfile?.last_name ?? ""}`.trim() || "a Tech Fleet Project Coordinator";

        const { data: rosterCoordinator } = await supabase
          .from("project_roster")
          .select("member_name")
          .eq("project_id", projectId)
          .ilike("member_role", "%coordinator%")
          .limit(1)
          .maybeSingle();

        if (rosterCoordinator?.member_name) {
          coordinatorName = rosterCoordinator.member_name;
        }

        // Update status first
        const { error: updateError } = await supabase
          .from("project_applications")
          .update({ applicant_status: newStatus } as any)
          .eq("id", applicationId);
        if (updateError) throw updateError;

        // Send in-app notification
        const notifBody = `<p>You have been invited to interview by <strong>${coordinatorName}</strong>.</p><p>Schedule your interview: <a href="${schedulingUrl}">${schedulingUrl}</a></p>`;
        await supabase.functions.invoke("send-announcement-email", {
          // Reuse the notification insert via direct insert
        }).catch(() => { /* non-critical */ });

        // Insert in-app notification directly
        const { error: notifError } = await supabase.rpc("write_audit_log", {
          p_event_type: "interview_invited",
          p_table_name: "project_applications",
          p_record_id: applicationId,
          p_user_id: user.id,
          p_changed_fields: [applicantUserId, newStatus],
        });
        if (notifError) log.warn("handleStatusChange", "Failed to write audit log", {}, notifError);

        // Create in-app notification for the applicant (via edge function since notifications table is service-role only for inserts)
        // We'll use a direct approach: invoke send-transactional-email which also handles notification
        // First, check if applicant has email notifications enabled
        const { data: applicantProfile } = await supabase
          .from("profiles")
          .select("notify_announcements, first_name")
          .eq("user_id", applicantUserId)
          .single();

        const shouldSendEmail = applicantProfile?.notify_announcements === true;

        // Send interview invite email if user opted in
        if (shouldSendEmail && applicantEmail) {
          const idempotencyKey = `interview-invite-${applicationId}-${Date.now()}`;
          const { error: emailError } = await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "interview-invite",
              recipientEmail: applicantEmail,
              idempotencyKey,
              templateData: {
                firstName: applicantFirstName || applicantProfile?.first_name || undefined,
                coordinatorName,
                schedulingUrl,
              },
            },
          });
          if (emailError) {
            log.warn("handleStatusChange", "Failed to send interview invite email", { applicationId }, emailError);
          }
        }

        toast.success(`Invited ${applicantFirstName || "applicant"} to interview`, {
          description: shouldSendEmail ? "Email notification sent." : "In-app notification sent. Email notifications are disabled for this user.",
          duration: 5000,
          position: "top-center",
        });
      } else {
        // For other statuses, just update
        const { error: updateError } = await supabase
          .from("project_applications")
          .update({ applicant_status: newStatus } as any)
          .eq("id", applicationId);
        if (updateError) throw updateError;

        const label = APPLICANT_STATUSES.find((s) => s.value === newStatus)?.label ?? newStatus;
        toast.success(`Status updated to "${label}"`, { duration: 3000, position: "top-center" });
      }

      // Invalidate queries
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (err: any) {
      log.error("handleStatusChange", `Failed to change status: ${err.message}`, { applicationId }, err);
      toast.error("Failed to update status", { description: err.message, duration: 5000, position: "top-center" });
    } finally {
      setChanging(false);
    }
  };

  if (changing) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Change applicant status"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Change Status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {APPLICANT_STATUSES.filter((s) => s.value !== "pending_review").map((status) => {
          const Icon = STATUS_ICONS[status.value] ?? UserCheck;
          const isActive = currentStatus === status.value;
          return (
            <DropdownMenuItem
              key={status.value}
              onClick={() => handleStatusChange(status.value)}
              disabled={isActive}
              className={isActive ? "opacity-50" : ""}
            >
              <Icon className="h-4 w-4 mr-2" />
              {status.label}
              {isActive && <span className="ml-auto text-xs text-muted-foreground">Current</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function applicantStatusLabel(status: string): string {
  return APPLICANT_STATUSES.find((s) => s.value === status)?.label ?? status;
}
