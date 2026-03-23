import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { User, Globe, MessageCircle, Check, ChevronsUpDown, Mail, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ProfileService } from "@/services/profile.service";
import { JourneyService } from "@/services/journey.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { profileSchema, ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { EDUCATION_OPTIONS } from "@/lib/application-options";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { AvatarUpload } from "@/components/AvatarUpload";
import { ExperienceAreasSelect } from "@/components/ExperienceAreasSelect";
import { ValidatedField } from "@/components/ui/validated-field";
import { validationBorderClass, getFieldValidationState, showFormErrors, scrollToFirstError } from "@/lib/form-validation";
import { toast } from "sonner";

export default function ProfileSetupPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const isOAuth = user?.app_metadata?.provider === "google" || user?.app_metadata?.providers?.includes("google");

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", country: "", timezone: "",
    discordUsername: "", interests: [] as string[],
    portfolio_url: "", linkedin_url: "", scheduling_url: "",
    experience_areas: [] as string[], professional_goals: "",
    notify_training_opportunities: false, notify_announcements: false,
    education_background: [] as string[],
    has_discord_account: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  // Real-time validation
  useEffect(() => {
    if (Object.keys(touched).length === 0) return;
    const result = profileSchema.safeParse({
      firstName: form.firstName, lastName: form.lastName, country: form.country,
      timezone: form.timezone, discordUsername: form.discordUsername,
      interests: form.interests, portfolio_url: form.portfolio_url,
      linkedin_url: form.linkedin_url, experience_areas: form.experience_areas,
      professional_goals: form.professional_goals,
      notify_training_opportunities: form.notify_training_opportunities,
      notify_announcements: form.notify_announcements,
      education_background: form.education_background,
      has_discord_account: form.has_discord_account,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      const touchedErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (touched[k]) touchedErrors[k] = v;
      }
      setErrors(touchedErrors);
    } else {
      setErrors({});
    }
  }, [form, touched]);

  useEffect(() => {
    if (!initialized && profile) {
      setForm({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: profile.email || user?.email || "",
        country: profile.country || "",
        timezone: profile.timezone || "",
        discordUsername: profile.discord_username || "",
        interests: profile.interests || [],
        portfolio_url: profile.portfolio_url || "",
        linkedin_url: profile.linkedin_url || "",
        experience_areas: profile.experience_areas || [],
        professional_goals: profile.professional_goals || "",
        notify_training_opportunities: profile.notify_training_opportunities || false,
        notify_announcements: (profile as any).notify_announcements || false,
        education_background: profile.education_background || [],
        has_discord_account: (profile as any).has_discord_account ?? true,
      });
      setInitialized(true);
    }
  }, [profile, initialized, user]);

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

    // Mark all required fields as touched
    const allTouched: Record<string, boolean> = {
      firstName: true, lastName: true, country: true, timezone: true,
      discordUsername: true, email: true,
    };
    setTouched(allTouched);

    // Validate email for non-OAuth
    const fieldErrors: Record<string, string> = {};
    if (!isOAuth) {
      if (!form.email.trim()) fieldErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fieldErrors.email = "Please enter a valid email";
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      showFormErrors(fieldErrors, { email: "Email" });
      scrollToFirstError();
      return;
    }

    const result = profileSchema.safeParse({
      firstName: form.firstName,
      lastName: form.lastName,
      country: form.country,
      timezone: form.timezone,
      discordUsername: form.discordUsername,
      interests: form.interests,
      portfolio_url: form.portfolio_url,
      linkedin_url: form.linkedin_url,
      experience_areas: form.experience_areas,
      professional_goals: form.professional_goals,
      notify_training_opportunities: form.notify_training_opportunities,
      notify_announcements: form.notify_announcements,
      education_background: form.education_background,
      has_discord_account: form.has_discord_account,
    });

    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!errs[field]) errs[field] = err.message;
      });
      setErrors(errs);
      showFormErrors(errs, {
        firstName: "First name", lastName: "Last name", country: "Country",
        timezone: "Timezone", discordUsername: "Discord username",
      });
      scrollToFirstError();
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      await ProfileService.update(user.id, result.data, !isOAuth ? form.email.trim() : undefined);
      await refreshProfile();
      await JourneyService.upsertTask(user.id, "first_steps", "profile", true);
      const displayName = `${result.data.firstName} ${result.data.lastName}`.trim();
      const discordUser = result.data.discordUsername || undefined;
      const updatedProfile = await ProfileService.fetch(user.id);
      const discordId = updatedProfile?.discord_user_id || undefined;
      DiscordNotifyService.profileCompleted(displayName, result.data.country, discordUser, discordId);
      DiscordNotifyService.taskCompleted(displayName, "profile", discordUser, discordId);

      // If user doesn't have Discord, generate their personal invite (fire & forget)
      if (!form.has_discord_account) {
        supabase.functions.invoke("generate-discord-invite").catch(() => {});
      }

      navigate("/courses/onboarding", { replace: true });
    } catch (err: any) {
      setErrors({ general: err.message });
    } finally {
      setSaving(false);
    }
  };

  const bc = (field: string, value: string | string[] | boolean) =>
    validationBorderClass(getFieldValidationState(errors[field], value, !!touched[field]));

  return (
    <div className="container-app py-8 sm:py-12 max-w-2xl animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Set Up Your Profile</h1>
          <p className="text-muted-foreground mt-1">
            Complete your profile to get the most out of Tech Fleet.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/courses/onboarding", { replace: true })}>
          Skip for now
        </Button>
      </div>

      <div className="card-elevated p-6 sm:p-8">
        {errors.general && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Avatar */}
          {user && (
            <AvatarUpload
              userId={user.id}
              currentUrl={profile?.avatar_url || null}
              initials={`${(form.firstName?.[0] || "").toUpperCase()}${(form.lastName?.[0] || "").toUpperCase()}` || "U"}
              onUploaded={() => {}}
            />
          )}

          {/* Email */}
          <ValidatedField id="setup-email" label="Email" required={!isOAuth} error={errors.email} value={form.email} touched={touched.email}>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="setup-email"
                type="email"
                value={form.email}
                onChange={(e) => !isOAuth && setForm({ ...form, email: e.target.value })}
                onBlur={() => markTouched("email")}
                readOnly={!!isOAuth}
                disabled={!!isOAuth}
                className={cn("pl-10", isOAuth && "bg-muted/50", bc("email", form.email))}
                aria-invalid={!!errors.email}
              />
            </div>
            {isOAuth && <p className="text-xs text-muted-foreground">Email is managed by your Google account.</p>}
          </ValidatedField>

          {/* First name */}
          <ValidatedField id="setup-firstName" label="First name" required error={errors.firstName} value={form.firstName} touched={touched.firstName}>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input id="setup-firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} onBlur={() => markTouched("firstName")} placeholder="Jane" className={cn("pl-10", bc("firstName", form.firstName))} required aria-invalid={!!errors.firstName} />
            </div>
          </ValidatedField>

          {/* Last name */}
          <ValidatedField id="setup-lastName" label="Last name" required error={errors.lastName} value={form.lastName} touched={touched.lastName}>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input id="setup-lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} onBlur={() => markTouched("lastName")} placeholder="Doe" className={cn("pl-10", bc("lastName", form.lastName))} required aria-invalid={!!errors.lastName} />
            </div>
          </ValidatedField>

          {/* Country */}
          <ValidatedField id="setup-country" label="Country" required error={errors.country} value={form.country} touched={touched.country}>
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={countryOpen} className={cn("w-full justify-between pl-10 relative font-normal", !form.country && "text-muted-foreground", bc("country", form.country))} aria-invalid={!!errors.country}>
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {form.country || "Select a country"}
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search countries..." />
                  <CommandList>
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup>
                      {COUNTRIES.map((c) => (
                        <CommandItem key={c.code} value={c.name} onSelect={() => { setForm({ ...form, country: c.name }); setCountryOpen(false); markTouched("country"); }}>
                          <Check className={cn("mr-2 h-4 w-4", form.country === c.name ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </ValidatedField>

          {/* Timezone */}
          <ValidatedField id="setup-timezone" label="Timezone" required error={errors.timezone} value={form.timezone} touched={touched.timezone}>
            <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={timezoneOpen} className={cn("w-full justify-between pl-10 relative font-normal", !form.timezone && "text-muted-foreground", bc("timezone", form.timezone))} aria-invalid={!!errors.timezone}>
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {form.timezone ? TIMEZONES.find((tz) => tz.value === form.timezone)?.label || form.timezone : "Select a timezone"}
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search timezones..." />
                  <CommandList>
                    <CommandEmpty>No timezone found.</CommandEmpty>
                    <CommandGroup>
                      {TIMEZONES.map((tz) => (
                        <CommandItem key={tz.value} value={tz.label} onSelect={() => { setForm({ ...form, timezone: tz.value }); setTimezoneOpen(false); markTouched("timezone"); }}>
                          <Check className={cn("mr-2 h-4 w-4", form.timezone === tz.value ? "opacity-100" : "opacity-0")} />
                          {tz.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </ValidatedField>

          {/* Discord account detection */}
          <div className="space-y-3">
            <Label>Do you have a Discord account?</Label>
            <p className="text-xs text-muted-foreground">Tech Fleet's community lives on Discord. Let us know if you already have an account.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, has_discord_account: true })}
                className={cn(
                  "flex-1 p-3 rounded-lg border transition-all text-sm font-medium",
                  form.has_discord_account ? "border-primary bg-primary/5 text-foreground" : "border-border hover:border-primary/50 text-muted-foreground"
                )}
              >
                Yes, I have one
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, has_discord_account: false, discordUsername: "" })}
                className={cn(
                  "flex-1 p-3 rounded-lg border transition-all text-sm font-medium",
                  !form.has_discord_account ? "border-primary bg-primary/5 text-foreground" : "border-border hover:border-primary/50 text-muted-foreground"
                )}
              >
                No, I'm new to Discord
              </button>
            </div>
          </div>

          {/* Discord username — only if they have an account */}
          {form.has_discord_account && (
            <ValidatedField id="setup-discord" label="Discord username" error={errors.discordUsername} value={form.discordUsername} touched={touched.discordUsername} description="Enter your Discord username so we can connect with you.">
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="setup-discord" value={form.discordUsername} onChange={(e) => setForm({ ...form, discordUsername: e.target.value })} onBlur={() => markTouched("discordUsername")} placeholder="username" className={cn("pl-10", bc("discordUsername", form.discordUsername))} aria-invalid={!!errors.discordUsername} />
              </div>
            </ValidatedField>
          )}

          {!form.has_discord_account && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <p>No worries! After you complete your profile, we'll generate a <strong className="text-foreground">personal Discord invite link</strong> just for you.</p>
            </div>
          )}

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

          {/* Portfolio & LinkedIn */}
          <ValidatedField id="setup-portfolio" label="Portfolio URL" value={form.portfolio_url}>
            <Input id="setup-portfolio" type="url" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} placeholder="https://yourportfolio.com" maxLength={500} />
          </ValidatedField>

          <ValidatedField id="setup-linkedin" label="LinkedIn URL" value={form.linkedin_url}>
            <Input id="setup-linkedin" type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/yourprofile" maxLength={500} />
          </ValidatedField>

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
          <ValidatedField id="setup-goals" label="Professional development goals" value={form.professional_goals}>
            <Textarea
              id="setup-goals"
              value={form.professional_goals}
              onChange={(e) => setForm({ ...form, professional_goals: e.target.value })}
              placeholder="Describe your professional development goals..."
              className="min-h-[100px] resize-y"
              maxLength={5000}
            />
          </ValidatedField>

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

          {/* Notification preferences */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base font-semibold">Notification preferences</Label>
            <div className="flex items-start gap-3">
              <Checkbox id="setup-notify-training" checked={form.notify_training_opportunities} onCheckedChange={(checked) => setForm({ ...form, notify_training_opportunities: !!checked })} />
              <div>
                <Label htmlFor="setup-notify-training" className="text-sm leading-relaxed cursor-pointer">
                  Notify me about training opportunities that match my preferences
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive in-app notifications when matching opportunities open.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="setup-notify-announcements" checked={form.notify_announcements} onCheckedChange={(checked) => setForm({ ...form, notify_announcements: !!checked })} />
              <div>
                <Label htmlFor="setup-notify-announcements" className="text-sm leading-relaxed cursor-pointer">
                  Send me email notifications
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive emails about announcements and, if combined with the above, training opportunity alerts.</p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4">
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Complete Profile Setup"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
