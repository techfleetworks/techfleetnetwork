import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COHORT_REGISTRATION_STATUSES,
  cohortRegistrationStatusLabel,
  canOpenRegistration,
  isRegistrationOpenStatus,
  type CohortRegistrationStatus,
} from "@/lib/validators/cohort";
import { useSetCohortRegistrationStatus } from "@/hooks/use-cohorts";
import { extractErrorMessage } from "@/lib/errors/extract";

/**
 * Owner/admin control to set a cohort's registration status (Coming Soon / Register Now / Live /
 * Finished) — distinct from the cohort's publish status (Draft/Published). Renders on the cohort
 * record (ClassDetailPage). Data access goes through the hook -> service -> RPC; this component only
 * renders and formats. The read-only badge for non-editors lives in the page. Works at any publish
 * status because the write path is the owner-or-admin RPC, not a table update (which the RLS
 * restricts to draft|pending_review for owners).
 */
export function CohortRegistrationStatusControl({
  cohortId,
  classId,
  value,
  cohortLabel,
  cohortStatus,
  cohortEndDate,
}: {
  cohortId: string;
  classId: string | undefined;
  value: CohortRegistrationStatus;
  cohortLabel: string;
  /** The cohort's PUBLISH status + end date — gate the register-open options (mirrors the DB guard). */
  cohortStatus: string;
  cohortEndDate: string | null | undefined;
}) {
  const mutation = useSetCohortRegistrationStatus(classId);
  // Open states (Register Now / Live) are only valid on a published, not-ended cohort — the same
  // rule the DB enforces. Disable them up front so an admin isn't bounced by the RPC error.
  const canOpen = canOpenRegistration(cohortStatus, cohortEndDate);

  return (
    <Select
      value={value}
      disabled={mutation.isPending}
      onValueChange={(next) => {
        if (next === value) return;
        mutation.mutate(
          { cohortId, status: next as CohortRegistrationStatus },
          {
            onSuccess: () =>
              toast.success(
                `Registration status set to ${cohortRegistrationStatusLabel(next as CohortRegistrationStatus)}`
              ),
            onError: (err) => {
              const { message, description } = extractErrorMessage(
                err,
                "We couldn't update the registration status."
              );
              toast.error(message, description ? { description } : undefined);
            },
          }
        );
      }}
    >
      <SelectTrigger
        className="h-8 w-[150px]"
        aria-label={`Set registration status for cohort ${cohortLabel}`}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        {COHORT_REGISTRATION_STATUSES.map((s) => {
          const blockedOpen = isRegistrationOpenStatus(s.value) && !canOpen && s.value !== value;
          return (
            <SelectItem
              key={s.value}
              value={s.value}
              disabled={blockedOpen}
              title={blockedOpen ? "Publish the cohort (with a future end date) before opening registration" : undefined}
            >
              {s.label}
              {blockedOpen ? " — publish first" : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
