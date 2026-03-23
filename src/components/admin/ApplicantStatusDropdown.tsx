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
      // For "Invite to Interview", check admin's scheduling link first
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

        // Find coordinator name
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

        // Call edge function that handles status update + notification + email
        const { data, error } = await supabase.functions.invoke("notify-applicant-status", {
          body: {
            applicationId,
            applicantUserId,
            applicantEmail,
            applicantFirstName,
            newStatus,
            coordinatorName,
            schedulingUrl,
            projectId,
          },
        });

        if (error) throw error;

        const result = data as { notificationCreated?: boolean; emailSent?: boolean } | null;
        const parts: string[] = [];
        if (result?.notificationCreated) parts.push("In-app notification sent");
        if (result?.emailSent) parts.push("Email sent");

        toast.success(`Invited ${applicantFirstName || "applicant"} to interview`, {
          description: parts.length > 0 ? parts.join(". ") + "." : "Status updated.",
          duration: 5000,
          position: "top-center",
        });
      } else {
        // For other statuses, use the edge function too (handles notification + status update)
        const { error } = await supabase.functions.invoke("notify-applicant-status", {
          body: {
            applicationId,
            applicantUserId,
            applicantEmail,
            applicantFirstName,
            newStatus,
            coordinatorName: "",
            projectId,
          },
        });
        if (error) throw error;

        const label = APPLICANT_STATUSES.find((s) => s.value === newStatus)?.label ?? newStatus;
        toast.success(`Status updated to "${label}"`, {
          description: "Applicant has been notified.",
          duration: 3000,
          position: "top-center",
        });
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
        {triggerLabel ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-label="Change applicant status"
          >
            <MoreHorizontal className="h-4 w-4" />
            {triggerLabel}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="Change applicant status"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
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
