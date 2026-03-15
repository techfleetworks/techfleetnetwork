import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, User, Briefcase } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function ProfileSetupPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: "", bio: "", background: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Pre-fill from existing profile
  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.display_name || "",
        bio: profile.bio || "",
        background: profile.professional_background || "",
      });
    }
  }, [profile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!form.displayName.trim()) newErrors.displayName = "Display name is required.";
    if (!form.bio.trim()) newErrors.bio = "Bio is required.";
    if (!form.background.trim()) newErrors.background = "Professional background is required.";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.displayName.trim(),
        bio: form.bio.trim(),
        professional_background: form.background.trim(),
        profile_completed: true,
      })
      .eq("user_id", user!.id);

    if (error) {
      setErrors({ general: "Failed to save profile. Please try again." });
      setSaving(false);
      return;
    }

    await refreshProfile();

    // Also mark profile task as completed in journey_progress
    await supabase.from("journey_progress").upsert({
      user_id: user!.id,
      phase: "first_steps" as const,
      task_id: "profile",
      completed: true,
      completed_at: new Date().toISOString(),
    }, { onConflict: "user_id,phase,task_id" });

    setSaving(false);
    setSaved(true);
  };

  if (saved) {
    return (
      <div className="container-app py-12 max-w-2xl animate-fade-in">
        <div className="card-elevated p-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Profile complete!</h1>
          <p className="text-muted-foreground mb-6">Your profile has been saved. Continue with your First Steps.</p>
          <Link to="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Set up your profile</h1>
        <p className="text-muted-foreground mt-1">Complete your profile to continue onboarding. All fields are required.</p>
      </div>

      <div className="card-elevated p-6 sm:p-8">
        {errors.general && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
            {errors.general}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="How should others see you?"
                className="pl-10"
                required
                aria-required="true"
                aria-invalid={!!errors.displayName}
                aria-describedby={errors.displayName ? "dn-error" : undefined}
              />
            </div>
            {errors.displayName && (
              <p id="dn-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                <AlertCircle className="h-3 w-3" /> {errors.displayName}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Tell us a bit about yourself..."
              rows={3}
              required
              aria-required="true"
              aria-invalid={!!errors.bio}
              aria-describedby={errors.bio ? "bio-error" : undefined}
            />
            {errors.bio && (
              <p id="bio-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                <AlertCircle className="h-3 w-3" /> {errors.bio}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="background">Professional background</Label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Textarea
                id="background"
                value={form.background}
                onChange={(e) => setForm({ ...form, background: e.target.value })}
                placeholder="Describe your professional experience..."
                rows={3}
                className="pl-10"
                required
                aria-required="true"
                aria-invalid={!!errors.background}
                aria-describedby={errors.background ? "bg-error" : undefined}
              />
            </div>
            {errors.background && (
              <p id="bg-error" className="text-sm text-destructive flex items-center gap-1" role="alert">
                <AlertCircle className="h-3 w-3" /> {errors.background}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </form>
      </div>
    </div>
  );
}
