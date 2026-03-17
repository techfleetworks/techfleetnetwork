import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AlertCircle, User, Globe, MessageCircle, Check, ChevronsUpDown, Mail, ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { JourneyService } from "@/services/journey.service";
import { DiscordNotifyService } from "@/services/discord-notify.service";
import { profileSchema, ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { COUNTRIES } from "@/lib/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { AvatarUpload } from "@/components/AvatarUpload";

const TOTAL_STEPS = 3;

export default function ProfileSetupPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
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

  // Only pre-populate form from profile ONCE on initial mount, not on every profile change
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && profile) {
      setForm({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: profile.email || user?.email || "",
        country: profile.country || "",
        hasDiscord: profile.discord_username ? true : null,
        discordUsername: profile.discord_username || "",
        interests: profile.interests || [],
      });
      setInitialized(true);
    }
  }, [profile, initialized]);

  const validateStep = (): boolean => {
    const fieldErrors: Record<string, string> = {};

    if (step === 1) {
      if (!form.firstName.trim()) fieldErrors.firstName = "First name is required";
      if (!form.lastName.trim()) fieldErrors.lastName = "Last name is required";
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
      await ProfileService.update(user!.id, result.data);
      await refreshProfile();
      await JourneyService.upsertTask(user!.id, "first_steps", "profile", true);
      const displayName = `${result.data.firstName} ${result.data.lastName}`.trim();
      const discordUser = result.data.discordUsername || undefined;
      const updatedProfile = await ProfileService.fetch(user!.id);
      const discordId = updatedProfile?.discord_user_id || undefined;
      DiscordNotifyService.profileCompleted(displayName, result.data.country, discordUser, discordId);
      DiscordNotifyService.taskCompleted(displayName, "profile", discordUser, discordId);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setErrors({ general: err.message });
    } finally {
      setSaving(false);
    }
  };

  /** Intercept native form submission (e.g. Enter key) — always prevent it.
   *  Navigation between steps and final save are handled by explicit button clicks only. */
  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    // On intermediate steps, advance. On final step, do nothing —
    // the user must explicitly click "Complete Setup".
    if (step < TOTAL_STEPS) {
      handleNext();
    }
  };

  return (
    <div className="container-app py-8 sm:py-12 max-w-2xl animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Tech Fleet</h1>
          <p className="text-muted-foreground mt-1">
            Let's get you set up. Step {step} of {TOTAL_STEPS}.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/dashboard", { replace: true })}>
          Skip for now
        </Button>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      <div className="card-elevated p-6 sm:p-8">
        {errors.general && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-6" noValidate>
          {/* STEP 1: Name & Country */}
          {step === 1 && (
            <>
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-foreground">Tell us about yourself</h2>
                <p className="text-sm text-muted-foreground">We'll use this to personalize your experience.</p>
              </div>

              {/* Avatar upload */}
              {user && (
                <AvatarUpload
                  userId={user.id}
                  currentUrl={profile?.avatar_url || null}
                  initials={
                    `${(form.firstName?.[0] || "").toUpperCase()}${(form.lastName?.[0] || "").toUpperCase()}` || "U"
                  }
                  onUploaded={() => {
                    // Avatar is saved directly; will be picked up on refreshProfile
                  }}
                />
              )}

              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="firstName"
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
                <Label htmlFor="lastName">Last name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="lastName"
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
              {(() => {
                const isOAuth = user?.app_metadata?.provider === "google" || user?.app_metadata?.providers?.includes("google");
                return (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="email"
                        type="email"
                        value={profile?.email || user?.email || ""}
                        onChange={(e) => !isOAuth && setForm({ ...form, email: e.target.value })}
                        readOnly={!!isOAuth}
                        disabled={!!isOAuth}
                        className={cn("pl-10", isOAuth && "bg-muted/50")}
                      />
                    </div>
                    {isOAuth ? (
                      <p className="text-xs text-muted-foreground">Email is managed by your Google account.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">You can update your contact email here.</p>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-2">
                <Label>Country</Label>
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
                  <Label htmlFor="discordUsername">Discord username</Label>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="discordUsername"
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
                    We recommend joining and completing the Discord Tutorial Series in the User Guide 
                    as part of your Onboarding Steps.
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
                    You can add your Discord username later from your profile. A "Join Tech Fleet Discord" 
                    step will appear in your Onboarding Steps checklist.
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
                  What kinds of activities do you want to do in Tech Fleet's Community?
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
                        "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background",
                        form.interests.includes(option)
                          ? "bg-primary text-primary-foreground flex items-center justify-center"
                          : "bg-transparent"
                      )}
                      aria-hidden="true"
                    >
                      {form.interests.includes(option) && (
                        <Check className="h-3 w-3" />
                      )}
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
      </div>
    </div>
  );
}
