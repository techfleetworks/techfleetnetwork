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
}: {
  cohortId: string;
  classId: string | undefined;
  value: CohortRegistrationStatus;
  cohortLabel: string;
}) {
  const mutation = useSetCohortRegistrationStatus(classId);

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
        {COHORT_REGISTRATION_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
