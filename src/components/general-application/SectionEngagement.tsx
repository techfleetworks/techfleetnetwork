import { Label } from "@/components/ui/label";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PREVIOUS_ENGAGEMENT_OPTIONS } from "@/lib/application-options";
import { LongFormQuestion } from "./LongFormQuestion";
import type { AppFormData } from "@/lib/validators/general-application";

const engagementOptions: MultiSelectOption[] = PREVIOUS_ENGAGEMENT_OPTIONS.map(
  (e) => ({ value: e, label: e })
);

interface Props {
  form: AppFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof AppFormData>(key: K, value: AppFormData[K]) => void;
}

/** Section 3: Engagement History — previous engagement, ways, teammate learnings */
export function SectionEngagement({ form, errors, updateField }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-base font-medium">
          Have you previously engaged with Tech Fleet? <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-col gap-2">
          {["yes", "no"].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => updateField("previous_engagement", val)}
              className={cn(
                "w-full text-left p-3 rounded-lg border-2 transition-all",
                form.previous_engagement === val
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <span className="font-medium text-foreground">
                {val === "yes" ? "Yes" : "No"}
              </span>
            </button>
          ))}
        </div>
        {errors.previous_engagement && (
          <p className="text-sm text-destructive flex items-center gap-1" role="alert">
            <AlertCircle className="h-3 w-3" /> {errors.previous_engagement}
          </p>
        )}
      </div>

      {form.previous_engagement === "yes" && (
        <>
          <div className="space-y-1.5">
            <Label>How have you engaged with Tech Fleet? <span className="text-destructive">*</span></Label>
            <MultiSelect
              options={engagementOptions}
              selected={form.previous_engagement_ways}
              onChange={(v) => updateField("previous_engagement_ways", v)}
              placeholder="Select engagement types"
            />
            {errors.previous_engagement_ways && (
              <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                <AlertCircle className="h-3 w-3" /> {errors.previous_engagement_ways}
              </p>
            )}
          </div>

          <LongFormQuestion
            id="teammate-learnings"
            label="What have you learned from your teammates at Tech Fleet?"
            value={form.teammate_learnings}
            onChange={(v) => updateField("teammate_learnings", v)}
            error={errors.teammate_learnings}
          />
        </>
      )}
    </div>
  );
}
