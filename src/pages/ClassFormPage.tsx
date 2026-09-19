import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { RichTextSection } from "@/components/forms/RichTextSection";
import { ClassImageUpload } from "@/components/ClassImageUpload";
import { useAuth } from "@/contexts/AuthContext";
import { useClassById } from "@/hooks/use-classes";
import { ClassService } from "@/services/class.service";
import { classFormSchema, type ClassFormValues } from "@/lib/validators/class";
import { useQueryClient } from "@/lib/react-query";
import { SKILLS_OPTIONS as SKILLS_FALLBACK } from "@/lib/skills-framework";
import { useReferenceList } from "@/hooks/use-reference";
import { useAutosave } from "@/hooks/use-autosave";
import { AutosaveStatus } from "@/components/ui/AutosaveStatus";
import { useServerDraft } from "@/hooks/use-server-draft";
import { DraftRestoredBanner } from "@/components/forms/DraftRestoredBanner";
import { extractErrorMessage } from "@/lib/errors/extract";
import { showFormErrors, scrollToFirstError } from "@/lib/form-validation";

/**
 * Create + edit form for a Class.
 *
 * Draft ownership (see docs/adr — single source of truth for create forms):
 * in create mode the `useServerDraft` buffer (`draft.value`) is the ONLY owner
 * of in-progress content — inputs read from and write to it directly. In edit
 * mode a local `editState`, seeded from the fetched row, plays the same role
 * and autosaves straight to the row. No second field-state store is mirrored
 * into the draft, so a restored draft simply renders — the bug where the
 * "was restored" banner showed over an empty form is structurally gone.
 */

type ClassWorking = { form: ClassFormValues; prereqText: string };

const CLASS_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  summary: "Summary",
  description: "Description",
  track: "Track",
  hero_image_url: "Hero image",
  skills: "Skills",
  outcomes: "Outcomes",
  why_take: "Why take this course?",
  audiences: "Audiences",
  prerequisites: "Prerequisites",
  curriculum: "Curriculum",
  reading_assignments: "Reading Assignments",
  class_expectations: "Class Expectations",
};

function csvToList(s: string): string[] {
  return s
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function ClassFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: existing, isLoading } = useClassById(id);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ClassFormValues, string>>>({});

  const defaults = useMemo<ClassFormValues>(
    () => ({
      title: "",
      summary: "",
      description: "",
      track: "basic_training",
      hero_image_url: "",
      skills: [],
      outcomes: "",
      why_take: "",
      audiences: "",
      prerequisites: [],
      curriculum: "",
      reading_assignments: "",
      class_expectations: "",
    }),
    []
  );

  // Server-side draft for create mode only. In edit mode the row itself is the
  // draft (autosaved below), so the server draft is disabled.
  const draft = useServerDraft<ClassWorking>({
    draftKey: "class:new",
    schemaVersion: 1,
    initialValue: { form: defaults, prereqText: "" },
    enabled: !isEdit,
    label: "class-form",
  });

  // Edit-mode working state, seeded once from the fetched row.
  const [editState, setEditState] = useState<ClassWorking>({ form: defaults, prereqText: "" });

  // One owner per mode. Create → the draft buffer; edit → local state.
  const working = isEdit ? editState : draft.value;
  const form = working.form;
  const prereqText = working.prereqText;
  const setWorking = isEdit ? setEditState : draft.setValue;
  const setForm = (updater: (f: ClassFormValues) => ClassFormValues) =>
    setWorking((w) => ({ ...w, form: updater(w.form) }));
  const setPrereqText = (v: string) => setWorking((w) => ({ ...w, prereqText: v }));

  // Hydrate the working state from the existing row (edit mode).
  useEffect(() => {
    if (!existing) return;
    // Seed edit-mode state from the async-fetched row — external data → state,
    // the sanctioned use of an effect (there is no render-time value to derive).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditState({
      form: {
        title: existing.title,
        summary: existing.summary,
        description: existing.description ?? "",
        track: existing.track,
        hero_image_url: existing.hero_image_url ?? "",
        skills: existing.skills ?? [],
        outcomes: existing.outcomes ?? "",
        why_take: existing.why_take ?? "",
        audiences: existing.audiences ?? "",
        prerequisites: existing.prerequisites ?? [],
        curriculum: (existing as { curriculum?: string }).curriculum ?? "",
        reading_assignments:
          (existing as { reading_assignments?: string }).reading_assignments ?? "",
        class_expectations: (existing as { class_expectations?: string }).class_expectations ?? "",
      },
      prereqText: (existing.prerequisites ?? []).join("\n"),
    });
  }, [existing]);

  const canAutosave =
    isEdit &&
    !!id &&
    !!existing &&
    (existing as { status?: string }).status !== "pending_review" &&
    (existing as { status?: string }).status !== "approved" &&
    (existing as { status?: string }).status !== "archived";

  // Prerequisites are edited as free text; the persisted value is derived from
  // that buffer at save time — one source of truth, both here and on submit.
  const autosaveValue = useMemo<ClassFormValues>(
    () => ({ ...form, prerequisites: csvToList(prereqText) }),
    [form, prereqText]
  );
  const autosave = useAutosave({
    value: autosaveValue,
    enabled: !!canAutosave,
    label: "class-form",
    onSave: async (values) => {
      if (!id) return;
      await ClassService.update(id, values as ClassFormValues);
    },
  });

  const onSubmit = async () => {
    if (!user) return;
    const candidate: ClassFormValues = { ...form, prerequisites: csvToList(prereqText) };
    const parsed = classFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof ClassFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof ClassFormValues;
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      showFormErrors(fieldErrors as Record<string, string>, CLASS_FIELD_LABELS);
      scrollToFirstError();
      return;
    }
    setErrors({});
    const payload = parsed.data;
    setSubmitting(true);
    try {
      if (isEdit && id) {
        await ClassService.update(id, payload);
        toast.success("Class saved");
      } else {
        const newId = await ClassService.create(user.id, payload);
        await draft.clearDraft();
        toast.success("Class created");
        await queryClient.invalidateQueries({ queryKey: ["classes"] });
        navigate(`/teach/classes/${newId}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      navigate(`/teach/classes/${id}`);
    } catch (err) {
      const { message, description } = extractErrorMessage(err, "We couldn't save your class.");
      toast.error(message, description ? { description } : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="container-app py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/teach/classes">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
      </Button>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-6">
        {isEdit ? "Edit Class" : "New Class"}
      </h1>

      {!isEdit && draft.restored && (
        <div className="mb-4">
          <DraftRestoredBanner
            restoredAt={draft.restoredAt}
            onDiscard={async () => {
              await draft.clearDraft();
              draft.setValue({ form: defaults, prereqText: "" });
            }}
            noun="class draft"
          />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
        className="space-y-6"
      >
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
        </div>

        <div>
          <Label htmlFor="track">Track</Label>
          <Select
            value={form.track}
            onValueChange={(v) => setForm((f) => ({ ...f, track: v as ClassFormValues["track"] }))}
          >
            <SelectTrigger id="track">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic_training">Basic Training</SelectItem>
              <SelectItem value="advanced_training">Advanced Training</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Hero image</Label>
          {user && (
            <ClassImageUpload
              userId={user.id}
              classId={id}
              value={form.hero_image_url || null}
              onChange={(url) => setForm((f) => ({ ...f, hero_image_url: url ?? "" }))}
            />
          )}
        </div>

        <RichTextSection
          id="rts-summary"
          label="Summary"
          placeholder="A short overview of the class…"
          value={form.summary}
          onChange={(html) => setForm((f) => ({ ...f, summary: html }))}
          error={errors.summary}
        />

        <RichTextSection
          id="rts-why-take"
          label="Why take this course?"
          placeholder="What learners gain, the value of taking this course…"
          value={form.why_take}
          onChange={(html) => setForm((f) => ({ ...f, why_take: html }))}
          error={errors.why_take}
        />

        <RichTextSection
          id="rts-outcomes"
          label="Outcomes"
          placeholder="What learners will be able to do after completing this class…"
          value={form.outcomes}
          onChange={(html) => setForm((f) => ({ ...f, outcomes: html }))}
          error={errors.outcomes}
        />

        <RichTextSection
          id="rts-audiences"
          label="Audiences"
          placeholder="Who this class is for…"
          value={form.audiences}
          onChange={(html) => setForm((f) => ({ ...f, audiences: html }))}
          error={errors.audiences}
        />

        <RichTextSection
          id="rts-curriculum"
          label="Curriculum"
          placeholder="Outline the modules, topics, and flow of the class (optional)…"
          value={form.curriculum}
          onChange={(html) => setForm((f) => ({ ...f, curriculum: html }))}
          error={errors.curriculum}
        />

        <RichTextSection
          id="rts-reading-assignments"
          label="Reading Assignments"
          placeholder="Books, articles, or links learners should read (optional)…"
          value={form.reading_assignments}
          onChange={(html) => setForm((f) => ({ ...f, reading_assignments: html }))}
          error={errors.reading_assignments}
        />

        <RichTextSection
          id="rts-class-expectations"
          label="Class Expectations"
          placeholder="Attendance, participation, time commitment, code of conduct (optional)…"
          value={form.class_expectations}
          onChange={(html) => setForm((f) => ({ ...f, class_expectations: html }))}
          error={errors.class_expectations}
        />

        <div>
          <Label htmlFor="skills">Skills</Label>
          <SkillsPicker
            value={form.skills}
            onChange={(v) => setForm((f) => ({ ...f, skills: v }))}
          />
          {errors.skills && <p className="text-xs text-destructive mt-1">{errors.skills}</p>}
        </div>

        <div>
          <Label htmlFor="prereq">Prerequisites (one per line)</Label>
          <Textarea
            id="prereq"
            rows={3}
            value={prereqText}
            onChange={(e) => setPrereqText(e.target.value)}
          />
        </div>

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
            {isEdit ? "Save changes" : "Create draft"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/teach/classes")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * SkillsPicker — DB-backed Tech Fleet skills selector.
 * Pulls from `reference_skills` via React Query (24h cache). If the table is
 * empty (admin hasn't synced yet) it falls back to the bundled framework list
 * so the form never renders an empty dropdown — graceful degradation.
 */
function SkillsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data, isLoading, isError } = useReferenceList("skills");
  const options = useMemo(() => {
    const fromDb = (data ?? []).map((r) => ({ value: r.name, label: r.name }));
    if (fromDb.length > 0) return fromDb;
    return SKILLS_FALLBACK;
  }, [data]);
  const placeholder = isLoading
    ? "Loading skills…"
    : isError
      ? "Skills (fallback list — DB unavailable)"
      : "Search the Tech Fleet skills framework…";
  return (
    <MultiSelect
      options={options}
      selected={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label="Skills"
    />
  );
}
