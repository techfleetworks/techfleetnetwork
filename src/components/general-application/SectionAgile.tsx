import { LongFormQuestion } from "./LongFormQuestion";
import type { AppFormData } from "@/lib/validators/general-application";

interface Props {
  form: AppFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof AppFormData>(key: K, value: AppFormData[K]) => void;
}

/** Section 4: Agile Mindset — four long-form questions */
export function SectionAgile({ form, errors, updateField }: Props) {
  return (
    <div className="space-y-6">
      <LongFormQuestion
        id="agile-waterfall"
        label="What is the difference between Agile and Waterfall methodologies? In your own words, why is Agile preferred in modern product development?"
        value={form.agile_vs_waterfall}
        onChange={(v) => updateField("agile_vs_waterfall", v)}
        error={errors.agile_vs_waterfall}
        required
      />
      <LongFormQuestion
        id="psych-safety"
        label="What does psychological safety mean to you? How would you contribute to creating a psychologically safe environment within your project team?"
        value={form.psychological_safety}
        onChange={(v) => updateField("psychological_safety", v)}
        error={errors.psychological_safety}
        required
      />
      <LongFormQuestion
        id="agile-philosophies"
        label="Which Agile philosophies or frameworks (e.g., Scrum, Kanban, Lean) resonate with you the most, and why?"
        value={form.agile_philosophies}
        onChange={(v) => updateField("agile_philosophies", v)}
        error={errors.agile_philosophies}
        required
      />
      <LongFormQuestion
        id="collab-challenges"
        label="Describe a time when you faced a challenge collaborating with others. How did you handle it, and what did you learn?"
        value={form.collaboration_challenges}
        onChange={(v) => updateField("collaboration_challenges", v)}
        error={errors.collaboration_challenges}
        required
      />
    </div>
  );
}
