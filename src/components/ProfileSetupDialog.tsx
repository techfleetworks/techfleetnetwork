import { useState, useEffect, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { AlertCircle, User, Globe, MessageCircle, Check, ChevronsUpDown, Mail, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { JourneyService } from "@/services/journey.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { profileSchema, ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { EDUCATION_OPTIONS } from "@/lib/application-options";
import { COUNTRIES } from "@/lib/countries";
import { ExperienceAreasSelect } from "@/components/ExperienceAreasSelect";
import { TIMEZONES } from "@/lib/timezones";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ProfileSetupDialog() {
  const { user, profile, profileLoaded, refreshProfile } = useAuth();
  const isOAuth = user?.app_metadata?.provider === "google" || user?.app_metadata?.providers?.includes("google");
  const shouldShow = !!user && profileLoaded && profile !== null && !profile.profile_completed;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", country: "", timezone: "",
    discordUsername: "", interests: [] as string[],
    portfolio_url: "", linkedin_url: "", scheduling_url: "",
    experience_areas: [] as string[], professional_goals: "",
    notify_training_opportunities: false, notify_announcements: false,
    education_background: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);

  useEffect(() => {
    setOpen(shouldShow);
  }, [shouldShow]);

  useEffect(() => {
    if (!initialized && profile && user) {
      setForm({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: profile.email || user.email || "",
        country: profile.country || "",
        timezone: profile.timezone || "",
        discordUsername: profile.discord_username || "",
        interests: profile.interests || [],
        portfolio_url: profile.portfolio_url || "",
        linkedin_url: profile.linkedin_url || "",
        scheduling_url: (profile as any).scheduling_url || "",
        experience_areas: profile.experience_areas || [],
        professional_goals: profile.professional_goals || "",
        notify_training_opportunities: profile.notify_training_opportunities || false,
        notify_announcements: (profile as any).notify_announcements || false,
        education_background: profile.education_background || [],
      });
      setInitialized(true);
    }
  }, [profile, user, initialized]);

  // Profile setup is mandatory — no skip allowed

  const toggleInterest = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleComplete = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const fieldErrors: Record<string, string> = {};
    if (!isOAuth) {
      if (!form.email.trim()) fieldErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fieldErrors.email = "Please enter a valid email";
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
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
      scheduling_url: form.scheduling_url,
      experience_areas: form.experience_areas,
      professional_goals: form.professional_goals,
      notify_training_opportunities: form.notify_training_opportunities,
      notify_announcements: form.notify_announcements,
      education_background: form.education_background,
    });

    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!errs[field]) errs[field] = err.message;
      });
      setErrors(errs);
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
      setOpen(false);
    } catch (err: any) {
      setErrors({ general: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-full md:max-w-[80vw] lg:max-w-[70vw] xl:max-w-[60vw] h-[100dvh] md:h-auto md:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none md:rounded-lg overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-xl">Welcome to Tech Fleet</DialogTitle>
          <DialogDescription className="mt-1">
            Take a moment to set up your profile so we can personalize your experience. You can also finish this later from your onboarding steps.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 overflow-y-auto">
          <form id="profile-setup-form" onSubmit={handleComplete} className="space-y-6 pb-6" noValidate>
            {errors.general && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
                {errors.general}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-email">Email {!isOAuth && <span className="text-destructive">*</span>}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="dialog-email" type="email" value={form.email} onChange={(e) => !isOAuth && setForm({ ...form, email: e.target.value })} readOnly={!!isOAuth} disabled={!!isOAuth} className={cn("pl-10", isOAuth && "bg-muted/50")} aria-invalid={!!errors.email} />
              </div>
              {isOAuth && <p className="text-xs text-muted-foreground">Email is managed by your Google account.</p>}
              {errors.email && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.email}</p>}
            </div>

            {/* First name */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-firstName">First name <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="dialog-firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jane" className="pl-10" required aria-invalid={!!errors.firstName} />
              </div>
              {errors.firstName && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.firstName}</p>}
            </div>

            {/* Last name */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-lastName">Last name <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="dialog-lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" className="pl-10" required aria-invalid={!!errors.lastName} />
              </div>
              {errors.lastName && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.lastName}</p>}
            </div>

            {/* Country */}
            <div className="space-y-1.5">
              <Label>Country <span className="text-destructive">*</span></Label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={countryOpen} className={cn("w-full justify-between pl-10 relative font-normal", !form.country && "text-muted-foreground")} aria-invalid={!!errors.country}>
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
                          <CommandItem key={c.code} value={c.name} onSelect={() => { setForm({ ...form, country: c.name }); setCountryOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", form.country === c.name ? "opacity-100" : "opacity-0")} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.country && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.country}</p>}
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label>Timezone <span className="text-destructive">*</span></Label>
              <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={timezoneOpen} className={cn("w-full justify-between pl-10 relative font-normal", !form.timezone && "text-muted-foreground")} aria-invalid={!!errors.timezone}>
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
                          <CommandItem key={tz.value} value={tz.label} onSelect={() => { setForm({ ...form, timezone: tz.value }); setTimezoneOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", form.timezone === tz.value ? "opacity-100" : "opacity-0")} />
                            {tz.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.timezone && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.timezone}</p>}
            </div>

            {/* Discord */}
            <div className="space-y-1.5">
              <Label htmlFor="dialog-discord">Discord username</Label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="dialog-discord" value={form.discordUsername} onChange={(e) => setForm({ ...form, discordUsername: e.target.value })} placeholder="username" className="pl-10" aria-invalid={!!errors.discordUsername} />
              </div>
              <p className="text-xs text-muted-foreground">Tech Fleet's community lives on Discord. Enter your username if you have one.</p>
              {errors.discordUsername && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.discordUsername}</p>}
            </div>

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
            <div className="space-y-1.5">
              <Label htmlFor="dialog-portfolio">Portfolio URL</Label>
              <Input id="dialog-portfolio" type="url" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} placeholder="https://yourportfolio.com" maxLength={500} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dialog-linkedin">LinkedIn URL</Label>
              <Input id="dialog-linkedin" type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/yourprofile" maxLength={500} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dialog-scheduling">Your Scheduling Link</Label>
              <Input id="dialog-scheduling" type="url" value={form.scheduling_url} onChange={(e) => setForm({ ...form, scheduling_url: e.target.value })} placeholder="https://calendly.com/yourname" maxLength={500} />
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
              <Label htmlFor="dialog-goals">Professional development goals</Label>
              <Textarea
                id="dialog-goals"
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

            {/* Notification preferences */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base font-semibold">Notification preferences</Label>
              <div className="flex items-start gap-3">
                <Checkbox id="dialog-notify-training" checked={form.notify_training_opportunities} onCheckedChange={(checked) => setForm({ ...form, notify_training_opportunities: !!checked })} />
                <div>
                  <Label htmlFor="dialog-notify-training" className="text-sm leading-relaxed cursor-pointer">
                    Notify me about training opportunities that match my preferences
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Receive in-app notifications when matching opportunities open.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="dialog-notify-announcements" checked={form.notify_announcements} onCheckedChange={(checked) => setForm({ ...form, notify_announcements: !!checked })} />
                <div>
                  <Label htmlFor="dialog-notify-announcements" className="text-sm leading-relaxed cursor-pointer">
                    Send me email notifications
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Receive emails about announcements and, if combined with the above, training opportunity alerts.</p>
                </div>
              </div>
            </div>
          </form>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-6 py-4 shrink-0">
          <Button form="profile-setup-form" type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Complete Profile Setup"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
