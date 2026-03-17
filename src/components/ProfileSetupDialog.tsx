import { useState, useEffect, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, User, Globe, MessageCircle, Check, ChevronsUpDown, Mail, ArrowLeft, ArrowRight, ExternalLink, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { JourneyService } from "@/services/journey.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { profileSchema, ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const TOTAL_STEPS = 3;

export function ProfileSetupDialog() {
  const { user, profile, profileLoaded, refreshProfile } = useAuth();

  const isOAuth = user?.app_metadata?.provider === "google" || user?.app_metadata?.providers?.includes("google");
  // Only show on very first login after signup — check sessionStorage flag
  const isFirstLogin = sessionStorage.getItem("profile_setup_shown") !== "true";
  const shouldShow = !!user && profileLoaded && profile !== null && !profile.profile_completed && isFirstLogin;

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "",
    hasDiscord: null as boolean | null,
    discordUsername: "",
    interests: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Show dialog when profile is incomplete
  useEffect(() => {
    if (shouldShow && !dismissed) {
      setOpen(true);
      sessionStorage.setItem("profile_setup_shown", "true");
    } else {
      setOpen(false);
    }
  }, [shouldShow, dismissed]);

  // Pre-populate form
  useEffect(() => {
    if (!initialized && profile && user) {
      setForm({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: profile.email || user.email || "",
        country: profile.country || "",
        hasDiscord: profile.discord_username ? true : null,
        discordUsername: profile.discord_username || "",
        interests: profile.interests || [],
      });
      setInitialized(true);
    }
  }, [profile, user, initialized]);

  const handleSkip = () => {
    setDismissed(true);
    setOpen(false);
  };

  const validateStep = (): boolean => {
    const fieldErrors: Record<string, string> = {};

    if (step === 1) {
      if (!form.firstName.trim()) fieldErrors.firstName = "First name is required";
      if (!form.lastName.trim()) fieldErrors.lastName = "Last name is required";
      if (!form.email.trim()) fieldErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fieldErrors.email = "Please enter a valid email";
      if (!form.country.trim()) fieldErrors.country = "Country is required";
    }

    if (step === 2) {
      if (form.hasDiscord === null) fieldErrors.hasDiscord = "Please select an option";
      if (form.hasDiscord && !form.discordUsername.trim()) fieldErrors.discordUsername = "Discord username is required";
      if (form.hasDiscord && form.discordUsername.trim() && !/^[a-zA-Z0-9._]+$/.test(form.discordUsername.trim())) {
        fieldErrors.discordUsername = "Discord username can only contain letters, numbers, dots, and underscores";
      }
    }

    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  };

  const toggleInterest = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleComplete = async () => {
    if (!validateStep()) return;
    if (!user) return;

    const result = profileSchema.safeParse({
      firstName: form.firstName,
      lastName: form.lastName,
      country: form.country,
      discordUsername: form.hasDiscord ? form.discordUsername : "",
      interests: form.interests,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
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
      setDismissed(true);
    } catch (err: any) {
      setErrors({ general: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step < TOTAL_STEPS) {
      handleNext();
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleSkip(); }}>
      <DialogContent className="w-full max-w-full md:max-w-[70vw] h-[100dvh] md:h-auto md:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none md:rounded-lg overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">Welcome to Tech Fleet</DialogTitle>
              <DialogDescription className="mt-1">
                Let's get you set up. Step {step} of {TOTAL_STEPS}.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground shrink-0" onClick={handleSkip}>
              Skip for now
            </Button>
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 pb-6">
          <form onSubmit={handleFormSubmit} className="space-y-5" noValidate>
            {errors.general && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
                {errors.general}
              </div>
            )}

            {/* STEP 1: Name, Email & Country */}
            {step === 1 && (
              <>
                <div className="mb-2">
                  <h2 className="text-lg font-semibold text-foreground">Tell us about yourself</h2>
                  <p className="text-sm text-muted-foreground">We'll use this to personalize your experience.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="setup-firstName">First name <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="setup-firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      placeholder="Jane"
                      className="pl-10"
                      required
                      aria-invalid={!!errors.firstName}
                    />
                  </div>
                  {errors.firstName && (
                    <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" /> {errors.firstName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="setup-lastName">Last name <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="setup-lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      placeholder="Doe"
                      className="pl-10"
                      required
                      aria-invalid={!!errors.lastName}
                    />
                  </div>
                  {errors.lastName && (
                    <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" /> {errors.lastName}
                    </p>
                  )}
                </div>

                {/* Email: editable for email/password users, read-only for Google OAuth */}
                <div className="space-y-2">
                  <Label htmlFor="setup-email">Email <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="setup-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => !isOAuth && setForm({ ...form, email: e.target.value })}
                      readOnly={!!isOAuth}
                      disabled={!!isOAuth}
                      className={cn("pl-10", isOAuth && "bg-muted/50")}
                      required
                      aria-invalid={!!errors.email}
                    />
                  </div>
                  {isOAuth ? (
                    <p className="text-xs text-muted-foreground">Email is managed by your Google account.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">You can update your contact email here.</p>
                  )}
                  {errors.email && (
                    <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" /> {errors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Country <span className="text-destructive">*</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("w-full justify-between pl-10 relative font-normal", !form.country && "text-muted-foreground")}
                        aria-invalid={!!errors.country}
                      >
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
                              <CommandItem
                                key={c.code}
                                value={c.name}
                                onSelect={() => setForm({ ...form, country: c.name })}
                              >
                                <Check className={cn("mr-2 h-4 w-4", form.country === c.name ? "opacity-100" : "opacity-0")} />
                                {c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.country && (
                    <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" /> {errors.country}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* STEP 2: Discord */}
            {step === 2 && (
              <>
                <div className="mb-2">
                  <h2 className="text-lg font-semibold text-foreground">Do you have a Discord username?</h2>
                  <p className="text-sm text-muted-foreground">
                    Tech Fleet's community lives on Discord. Let us know if you're already there.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, hasDiscord: true })}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border-2 transition-all",
                      form.hasDiscord === true
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="font-medium text-foreground">Yes, I have a Discord username</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, hasDiscord: false, discordUsername: "" })}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border-2 transition-all",
                      form.hasDiscord === false
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="font-medium text-foreground">No, not yet</span>
                  </button>

                  {errors.hasDiscord && (
                    <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3" /> {errors.hasDiscord}
                    </p>
                  )}
                </div>

                {form.hasDiscord === true && (
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="setup-discordUsername">Discord username</Label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="setup-discordUsername"
                        value={form.discordUsername}
                        onChange={(e) => setForm({ ...form, discordUsername: e.target.value })}
                        placeholder="username"
                        className="pl-10"
                        required
                        aria-invalid={!!errors.discordUsername}
                      />
                    </div>
                    {errors.discordUsername && (
                      <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                        <AlertCircle className="h-3 w-3" /> {errors.discordUsername}
                      </p>
                    )}
                  </div>
                )}

                {form.hasDiscord === false && (
                  <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border space-y-3">
                    <p className="text-sm text-foreground font-medium">Join the Tech Fleet Discord community</p>
                    <p className="text-sm text-muted-foreground">
                      Discord is where our community connects, collaborates, and supports each other.
                    </p>
                    <a
                      href="https://techfleet.org/join"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Join Tech Fleet Discord
                    </a>
                    <p className="text-xs text-muted-foreground">
                      You can add your Discord username later from your profile.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* STEP 3: Interests */}
            {step === 3 && (
              <>
                <div className="mb-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    What kinds of activities interest you?
                  </h2>
                  <p className="text-sm text-muted-foreground">Choose all that apply. You can change this later.</p>
                </div>

                <div className="space-y-2">
                  {ACTIVITY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleInterest(option)}
                      className={cn(
                        "w-full text-left p-4 rounded-lg border-2 transition-all flex items-center gap-3",
                        form.interests.includes(option)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center",
                          form.interests.includes(option)
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-primary bg-transparent"
                        )}
                        aria-hidden="true"
                      >
                        {form.interests.includes(option) && <Check className="h-3 w-3" />}
                      </div>
                      <span className="text-sm font-medium text-foreground">{option}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-3 pt-2">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}

              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={handleNext} className="flex-1">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button type="button" className="flex-1" disabled={saving} onClick={handleComplete}>
                  {saving ? "Saving…" : "Complete Setup"}
                </Button>
              )}
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
