import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextSection } from "@/components/forms/RichTextSection";
import { CohortService } from "@/services/cohort.service";
import { cohortFormSchema, type CohortFormValues } from "@/lib/validators/cohort";
import { useQueryClient } from "@/lib/react-query";
import { useServerDraft } from "@/hooks/use-server-draft";
import { DraftRestoredBanner } from "@/components/forms/DraftRestoredBanner";
import { AutosaveStatus } from "@/components/ui/AutosaveStatus";
import { useAutosave } from "@/hooks/use-autosave";
import { useCohortById } from "@/hooks/use-cohorts";
import { extractErrorMessage } from "@/lib/errors/extract";
import { showFormErrors, scrollToFirstError } from "@/lib/form-validation";

/**
 * Create + edit form for a Cohort.
 *
 * Routes:
 *   /teach/classes/:id/cohorts/new                   → create
 *   /teach/classes/:id/cohorts/:cohortId/edit        → edit
 *
 * Draft ownership (see docs/adr — single source of truth for create forms):
 * create mode reads/writes the `useServerDraft` buffer (`draft.value`) directly;
 * edit mode uses a local state seeded from the fetched row and autosaves it. No
 * second field-state store is mirrored into the draft, so a restored draft just
 * renders.
 */

const COHORT_FIELD_LABELS: Record<string, string> = {
  label: "Cohort label",
  start_date: "Start date",
  end_date: "End date",
  registration_url: "Registration URL",
  meeting_url: "Meeting URL",
  timezone: "Timezone",
  capacity: "Capacity",
  schedule: "Schedule of Classes",
};

export default function CohortFormPage() {
  const { id: classId, cohortId } = useParams<{ id: string; cohortId?: string }>();
  const isEdit = !!cohortId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CohortFormValues, string>>>({});

  const { data: existing, isLoading: loadingExisting } = useCohortById(cohortId);

  const EMPTY = useMemo<CohortFormValues>(
    () => ({
      label: "",
      start_date: "",
      end_date: "",
      registration_url: "",
      meeting_url: "",
      timezone: "America/New_York",
      capacity: null,
      schedule: "",
    }),
    []
  );

  // Server-side draft for create mode only.
  const draft = useServerDraft<CohortFormValues>({
    draftKey: `cohort:new:${classId ?? "unknown"}`,
    schemaVersion: 1,
    initialValue: EMPTY,
    enabled: !isEdit && !!classId,
    label: "cohort-form",
  });

  // Edit-mode working state, seeded once from the fetched cohort.
  const [editForm, setEditForm] = useState<CohortFormValues>(EMPTY);

  // One owner per mode. Create → the draft buffer; edit → local state.
  const form = isEdit ? editForm : draft.value;
  const setForm: React.Dispatch<React.SetStateAction<CohortFormValues>> = isEdit
    ? setEditForm
    : draft.setValue;

  useEffect(() => {
    if (!isEdit) return;
    if (!existing) return;
    // Seed edit-mode state from the async-fetched row — external data → state,
    // the sanctioned use of an effect (there is no render-time value to derive).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditForm({
      label: existing.label,
      start_date: existing.start_date,
      end_date: existing.end_date,
      registration_url: existing.registration_url,
      meeting_url: existing.meeting_url ?? "",
      timezone: existing.timezone || "America/New_York",
      capacity: existing.capacity ?? null,
      schedule: (existing as { schedule?: string }).schedule ?? "",
    });
  }, [existing, isEdit]);

  // Edit-mode autosave (RLS-permitted statuses only).
  const canAutosave =
    isEdit &&
    !!cohortId &&
    !!existing &&
    (existing.status === "draft" || existing.status === "pending_review");
  const autosave = useAutosave({
    value: form,
    enabled: !!canAutosave,
    label: "cohort-form",
    onSave: async (values) => {
      if (!cohortId) return;
      await CohortService.update(cohortId, values as CohortFormValues);
    },
  });

  const onSubmit = async () => {
    if (!classId) return;
    const parsed = cohortFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CohortFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof CohortFormValues;
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      showFormErrors(fieldErrors as Record<string, string>, COHORT_FIELD_LABELS);
      scrollToFirstError();
      return;
    }
    setErrors({});
    const values = parsed.data;
    setSubmitting(true);
    try {
      if (isEdit && cohortId) {
        await CohortService.update(cohortId, values);
        toast.success("Cohort saved");
      } else {
        await CohortService.create(classId, values);
        await draft.clearDraft();
        toast.success("Cohort created");
      }
      await queryClient.invalidateQueries({ queryKey: ["cohorts", "class", classId] });
      if (cohortId) {
        await queryClient.invalidateQueries({ queryKey: ["cohorts", "byId", cohortId] });
      }
      navigate(`/teach/classes/${classId}`);
    } catch (err) {
      const { message, description } = extractErrorMessage(
        err,
        isEdit ? "We couldn't save your cohort." : "We couldn't create your cohort."
      );
      toast.error(message, description ? { description } : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  if (isEdit && loadingExisting) {
    return (
      <div className="container-app py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to={`/teach/classes/${classId}`}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to class
        </Link>
      </Button>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-6">
        {isEdit ? "Edit cohort" : "New cohort"}
      </h1>

      {!isEdit && draft.restored && (
        <div className="mb-4">
          <DraftRestoredBanner
            restoredAt={draft.restoredAt}
            onDiscard={async () => {
              await draft.clearDraft();
              draft.setValue(EMPTY);
            }}
            noun="cohort draft"
          />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            placeholder="e.g. Spring 2026"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            aria-invalid={!!errors.label}
          />
          {errors.label && <p className="text-xs text-destructive mt-1">{errors.label}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start">Start date</Label>
            <Input
              id="start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              aria-invalid={!!errors.start_date}
            />
            {errors.start_date && (
              <p className="text-xs text-destructive mt-1">{errors.start_date}</p>
            )}
          </div>
          <div>
            <Label htmlFor="end">End date</Label>
            <Input
              id="end"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              aria-invalid={!!errors.end_date}
            />
            {errors.end_date && <p className="text-xs text-destructive mt-1">{errors.end_date}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="reg">Registration URL</Label>
          <Input
            id="reg"
            placeholder="https://…"
            value={form.registration_url}
            onChange={(e) => setForm((f) => ({ ...f, registration_url: e.target.value }))}
            aria-invalid={!!errors.registration_url}
          />
          {errors.registration_url && (
            <p className="text-xs text-destructive mt-1">{errors.registration_url}</p>
          )}
        </div>
        <div>
          <Label htmlFor="meeting">Meeting URL (optional)</Label>
          <Input
            id="meeting"
            placeholder="https://…"
            value={form.meeting_url ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, meeting_url: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tz">Timezone</Label>
            <Input
              id="tz"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="cap">Capacity (optional)</Label>
            <Input
              id="cap"
              type="number"
              min={1}
              value={form.capacity ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, capacity: v === "" ? null : Number(v) }));
              }}
            />
          </div>
        </div>

        <RichTextSection
          id="rts-schedule"
          label="Schedule of Classes"
          placeholder="Session dates and times, meeting cadence, holidays (optional)…"
          value={form.schedule}
          onChange={(html) => setForm((f) => ({ ...f, schedule: html }))}
          error={errors.schedule}
        />

        <div className="flex gap-2 items-center flex-wrap">
          {canAutosave && (
            <AutosaveStatus
              status={autosave.status}
              lastSavedAt={autosave.lastSavedAt}
              onRetry={autosave.retry}
            />
          )}
          {!isEdit && (
            <AutosaveStatus
              status={draft.status}
              lastSavedAt={draft.lastSavedAt}
              onRetry={() => void draft.flush()}
            />
          )}
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Create cohort"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/teach/classes/${classId}`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
