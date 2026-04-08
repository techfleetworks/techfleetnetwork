import { useState, useEffect, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { EDUCATION_OPTIONS } from "@/lib/application-options";
import { ExperienceAreasSelect } from "@/components/ExperienceAreasSelect";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function TrainingGoalsTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [form, setForm] = useState({
    interests: [] as string[],
    experience_areas: [] as string[],
    professional_goals: "",
    education_background: [] as string[],
  });

  useEffect(() => {
    if (!initialized && profile) {
      setForm({
        interests: profile.interests || [],
        experience_areas: profile.experience_areas || [],
        professional_goals: profile.professional_goals || "",
        education_background: profile.education_background || [],
      });
      setInitialized(true);
    }
  }, [profile, initialized]);

  const toggleInterest = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await ProfileService.update(user.id, {
        interests: form.interests,
        experience_areas: form.experience_areas,
        professional_goals: form.professional_goals,
        education_background: form.education_background,
      });
      await refreshProfile();
      setInitialized(false);
      toast.success("Training goals updated", { duration: 5000, position: "top-center" });
    } catch (err: any) {
      toast.error(err.message || "Failed to save", { duration: 30000, position: "top-center" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card-elevated p-6 sm:p-8 space-y-6">
        {/* Activity Interests */}
        <div className="space-y-3">
          <Label>Activity interests</Label>
          <p className="text-xs text-muted-foreground">What kinds of activities do you want to do in Tech Fleet?</p>
          {ACTIVITY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggleInterest(option)}
              className={cn(
                "w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3",
                form.interests.includes(option) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
            >
              <div className={cn("h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center", form.interests.includes(option) ? "bg-primary border-primary text-primary-foreground" : "border-primary")} aria-hidden="true">
                {form.interests.includes(option) && <Check className="h-3 w-3" />}
              </div>
              <span className="text-sm text-foreground">{option}</span>
            </button>
          ))}
        </div>

        {/* Experience Areas */}
        <div className="space-y-1.5">
          <Label>Experience areas</Label>
          <p className="text-xs text-muted-foreground">What areas do you want to gain experience in?</p>
          <ExperienceAreasSelect
            selected={form.experience_areas}
            onChange={(v) => setForm({ ...form, experience_areas: v })}
          />
        </div>

        {/* Professional Goals */}
        <div className="space-y-1.5">
          <Label htmlFor="training-goals-text">Professional development goals</Label>
          <Textarea
            id="training-goals-text"
            value={form.professional_goals}
            onChange={(e) => setForm({ ...form, professional_goals: e.target.value })}
            placeholder="Describe your professional development goals..."
            className="min-h-[100px] resize-y"
            maxLength={5000}
          />
        </div>

        {/* Education */}
        <div className="space-y-1.5">
          <Label>Education background</Label>
          <MultiSelect
            options={EDUCATION_OPTIONS.map((e) => ({ value: e, label: e }))}
            selected={form.education_background}
            onChange={(v) => setForm({ ...form, education_background: v })}
            placeholder="Search and select education..."
            aria-label="Education background"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Training Goals
        </Button>
      </div>
    </form>
  );
}
