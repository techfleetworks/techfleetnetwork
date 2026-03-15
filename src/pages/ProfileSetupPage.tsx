import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, User, Briefcase } from "lucide-react";

const mandatoryFields = ["displayName", "bio", "background"] as const;

export default function ProfileSetupPage() {
  const [form, setForm] = useState({ displayName: "", bio: "", background: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!form.displayName.trim()) newErrors.displayName = "Display name is required.";
    if (!form.bio.trim()) newErrors.bio = "Bio is required.";
    if (!form.background.trim()) newErrors.background = "Professional background is required.";
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) setSaved(true);
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

          <Button type="submit" className="w-full">Save Profile</Button>
        </form>
      </div>
    </div>
  );
}
