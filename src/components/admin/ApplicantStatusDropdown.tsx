import { useState, useCallback } from "react";
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

/* ------------------------------------------------------------------ */
/*  Status definitions                                                 */
/* ------------------------------------------------------------------ */

export const APPLICANT_STATUSES = [
  { value: "pending_review", label: "Pending Review" },
  { value: "invited_to_interview", label: "Invite to Interview" },
  { value: "interview_accepted", label: "Interview Accepted" },
  { value: "interview_scheduled", label: "Interview Scheduled" },
  { value: "picked_for_team", label: "Picked for Team" },
  { value: "not_selected", label: "Not Selected" },
  { value: "active_participant", label: "Active Participant" },
  { value: "left_the_project", label: "Left the Project" },
] as const;

export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number]["value"];

/** Selectable statuses (excludes pending_review from the dropdown). */
const SELECTABLE_STATUSES = APPLICANT_STATUSES.filter((s) => s.value !== "pending_review");

const STATUS_ICONS: Record<string, typeof Calendar> = {
  invited_to_interview: Calendar,
  interview_scheduled: Calendar,
  picked_for_team: UserCheck,
  not_selected: UserX,
  active_participant: Users,
  left_the_project: LogOut,
};

export function applicantStatusLabel(status: string): string {
  return APPLICANT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  applicationId: string;
  applicantUserId: string;
  applicantFirstName: string;
  applicantEmail: string;
  projectId: string;
  currentStatus: string;
  /** Query keys to invalidate after a successful status change. */
  invalidateKeys?: string[][];
  /** Renders a labeled button instead of the icon-only trigger. */
  triggerLabel?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Resolves the coordinator name from the project roster, falling back to the admin's profile. */
async function resolveCoordinatorName(projectId: string, fallbackName: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("project_roster")
      .select("member_name")
      .eq("project_id", projectId)
      .ilike("member_role", "%coordinator%")
      .limit(1)
      .maybeSingle();
    return data?.member_name || fallbackName;
  } catch {
    return fallbackName;
  }
}

/** Builds a human-readable display name from a profile object. */
function buildDisplayName(profile: Record<string, unknown> | null): string {
  if (!profile) return "a Tech Fleet Project Coordinator";
  const dn = profile.display_name as string;
  if (dn) return dn;
  const full = `${(profile.first_name as string) ?? ""} ${(profile.last_name as string) ?? ""}`.trim();
  return full || "a Tech Fleet Project Coordinator";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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

  const handleStatusChange = useCallback(
    async (newStatus: ApplicantStatus) => {
      if (newStatus === currentStatus || !user) return;
      setOpen(false);
      setChanging(true);

      try {
        /* -- Resolve coordinator info for interview invites -- */
        let coordinatorName = "";
        let schedulingUrl: string | undefined;

        if (newStatus === "invited_to_interview") {
          const adminProfile = await ProfileService.fetch(user.id);
          schedulingUrl = (adminProfile as unknown as Record<string, unknown>)?.scheduling_url as string | undefined;

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

          const fallbackName = buildDisplayName(adminProfile as unknown as Record<string, unknown> | null);
          coordinatorName = await resolveCoordinatorName(projectId, fallbackName);
        }

        /* -- Invoke edge function -- */
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

        /* -- Success toast -- */
        const result = data as { notificationCreated?: boolean; emailSent?: boolean } | null;

        if (newStatus === "invited_to_interview") {
          const parts: string[] = [];
          if (result?.notificationCreated) parts.push("In-app notification sent");
          if (result?.emailSent) parts.push("Email sent");
          toast.success(`Invited ${applicantFirstName || "applicant"} to interview`, {
            description: parts.length > 0 ? parts.join(". ") + "." : "Status updated.",
            duration: 5000,
            position: "top-center",
          });
        } else {
          const label = applicantStatusLabel(newStatus);
          toast.success(`Status updated to "${label}"`, {
            description: result?.notificationCreated
              ? "Applicant has been notified."
              : "Status updated.",
            duration: 3000,
            position: "top-center",
          });
        }

        /* -- Invalidate queries -- */
        await Promise.all(
          invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error("handleStatusChange", `Failed to change status: ${message}`, { applicationId }, err);
        toast.error("Failed to update status", {
          description: message,
          duration: 5000,
          position: "top-center",
        });
      } finally {
        setChanging(false);
      }
    },
    [applicationId, applicantUserId, applicantFirstName, applicantEmail, projectId, currentStatus, user, invalidateKeys, queryClient],
  );

  if (changing) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Updating status…" />;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {triggerLabel ? (
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Change applicant status">
            <MoreHorizontal className="h-4 w-4" />
            {triggerLabel}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Change applicant status">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Change Status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SELECTABLE_STATUSES.map((status) => {
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
