import { useState, useEffect, useLayoutEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  User, Globe, MessageCircle, Check, ChevronsUpDown,
  Mail, Trash2, KeyRound, Clock, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { AuthService } from "@/services/auth.service";
import { profileSchema, ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { EDUCATION_OPTIONS } from "@/lib/application-options";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { AvatarUpload } from "@/components/AvatarUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { ExperienceAreasSelect } from "@/components/ExperienceAreasSelect";
import { ValidatedField } from "@/components/ui/validated-field";
import { validationBorderClass, getFieldValidationState, showFormErrors, scrollToFirstError } from "@/lib/form-validation";

export default function EditProfilePage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const { setHeader } = usePageHeader();

  const isOAuth = user?.app_metadata?.provider === "google" || user?.app_metadata?.providers?.includes("google");

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", country: "", timezone: "",
    discordUsername: "", interests: [] as string[],
    portfolio_url: "", linkedin_url: "",
    experience_areas: [] as string[], professional_goals: "",
    notify_training_opportunities: false, notify_announcements: false,
    education_background: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [discordLinking, setDiscordLinking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs = ["basic-info", "training-goals", "preferences", "account"];
  const [activeTab, setActiveTab] = useState(
    tabParam && validTabs.includes(tabParam) ? tabParam : "basic-info"
  );

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
      });
      setErrors({});
      setInitialized(true);
    }
  }, [profile, user, initialized]);

  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  // Real-time validation for touched fields
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
      // Clear only touched field errors
      const remaining: Record<string, string> = {};
      for (const [k, v] of Object.entries(errors)) {
        if (!touched[k]) remaining[k] = v;
      }
      setErrors(remaining);
    }
  }, [form, touched]);

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

    // Mark all fields touched
    const allTouched: Record<string, boolean> = {
      firstName: true, lastName: true, country: true, timezone: true,
      discordUsername: true, email: true,
    };
    setTouched(allTouched);

    const result = profileSchema.safeParse({
      firstName: form.firstName, lastName: form.lastName, country: form.country,
      timezone: form.timezone, discordUsername: form.discordUsername,
      interests: form.interests, portfolio_url: form.portfolio_url,
      linkedin_url: form.linkedin_url, experience_areas: form.experience_areas,
      professional_goals: form.professional_goals,
      notify_training_opportunities: form.notify_training_opportunities,
      notify_announcements: form.notify_announcements,
      education_background: form.education_background,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);

      const fieldLabels: Record<string, string> = {
        firstName: "First name", lastName: "Last name", country: "Country",
        timezone: "Timezone", discordUsername: "Discord username", email: "Email",
      };
      showFormErrors(fieldErrors, fieldLabels);

      // Switch to tab with first error
      const fieldToTab: Record<string, string> = {
        firstName: "basic-info", lastName: "basic-info", country: "basic-info",
        timezone: "basic-info", discordUsername: "basic-info", email: "basic-info",
        interests: "training-goals", experience_areas: "training-goals",
        education_background: "training-goals", professional_goals: "training-goals",
      };
      const firstField = Object.keys(fieldErrors)[0];
      const targetTab = fieldToTab[firstField];
      if (targetTab) {
        setActiveTab(targetTab);
        scrollToFirstError();
      }
      return;
    }

    if (!isOAuth) {
      if (!form.email.trim()) {
        setErrors({ email: "Email is required" });
        showFormErrors({ email: "Email is required" }, { email: "Email" });
        setActiveTab("basic-info");
        scrollToFirstError();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setErrors({ email: "Please enter a valid email" });
        showFormErrors({ email: "Please enter a valid email" }, { email: "Email" });
        setActiveTab("basic-info");
        scrollToFirstError();
        return;
      }
    }

    setErrors({});
    setSaving(true);
    try {
      await ProfileService.update(user!.id, result.data, !isOAuth ? form.email.trim() : undefined);
      setInitialized(false);
      await refreshProfile();
      toast.success("Profile updated successfully", { duration: 5000, position: "top-center" });
    } catch (err: any) {
      setErrors({ general: err.message });
      showFormErrors({ general: err.message }, { general: "Save" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    setResetPasswordLoading(true);
    try {
      await AuthService.resetPassword(user.email, `${window.location.origin}/reset-password`);
      toast.success("Password reset email sent", {
        description: "Check your inbox for a link to reset your password.",
        duration: 5000,
        position: "top-center",
      });
    } catch {
      toast.info("If an account exists with that email, a reset link has been sent.", { duration: 5000, position: "top-center" });
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "Delete") return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error("Failed to delete account");
      toast.success("Your account has been deleted.", { duration: 5000, position: "top-center" });
      setDeleteDialogOpen(false);
      await supabase.auth.signOut({ scope: "local" });
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account. Please try again.", { duration: 30000, position: "top-center" });
    } finally {
      setDeleting(false);
    }
  };

  useLayoutEffect(() => {
    setHeader({
      breadcrumbs: [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Edit Profile" },
      ],
      title: "Edit Profile",
      description: "Manage your profile information, training goals, and preferences.",
    });
    return () => setHeader(null);
  }, [setHeader]);

  const vs = (field: string, value: string | string[] | boolean) =>
    getFieldValidationState(errors[field], value, !!touched[field]);
  const bc = (field: string, value: string | string[] | boolean) =>
    validationBorderClass(vs(field, value));

  return (
    <form
      id="edit-profile-form"
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col h-[calc(100vh-3rem)] animate-fade-in"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        {/* Sticky tabs */}
        <div className="sticky top-0 z-30 bg-background border-b px-4 sm:px-6 py-2">
          {errors.general && (
            <div className="mb-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" role="alert">
              {errors.general}
            </div>
          )}
          <TabsList>
            <TabsTrigger value="basic-info" className="gap-1.5">Basic Info</TabsTrigger>
            <TabsTrigger value="training-goals" className="gap-1.5">Training Goals</TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5">Preferences</TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5">Account</TabsTrigger>
          </TabsList>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="container-app max-w-3xl py-6">

          {/* ── Tab 1: Basic Info ── */}
          <TabsContent value="basic-info" className="space-y-6">
            <div className="card-elevated p-6 sm:p-8 space-y-6">
              {/* Avatar */}
              {user && (
                <AvatarUpload
                  userId={user.id}
                  currentUrl={profile?.avatar_url || null}
                  initials={`${(form.firstName?.[0] || "").toUpperCase()}${(form.lastName?.[0] || "").toUpperCase()}` || "U"}
                  onUploaded={async () => { await refreshProfile(); }}
                />
              )}

              {/* Email */}
              <ValidatedField id="edit-email" label="Email" error={errors.email} value={form.email} touched={touched.email}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="edit-email"
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
                {isOAuth ? (
                  <p className="text-xs text-muted-foreground">Email is managed by your Google account.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Update your contact email address.</p>
                )}
              </ValidatedField>

              {/* First name */}
              <ValidatedField id="edit-firstName" label="First name" required error={errors.firstName} value={form.firstName} touched={touched.firstName}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="edit-firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} onBlur={() => markTouched("firstName")} placeholder="Jane" className={cn("pl-10", bc("firstName", form.firstName))} required aria-invalid={!!errors.firstName} />
                </div>
              </ValidatedField>

              {/* Last name */}
              <ValidatedField id="edit-lastName" label="Last name" required error={errors.lastName} value={form.lastName} touched={touched.lastName}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="edit-lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} onBlur={() => markTouched("lastName")} placeholder="Doe" className={cn("pl-10", bc("lastName", form.lastName))} required aria-invalid={!!errors.lastName} />
                </div>
              </ValidatedField>

              {/* Country */}
              <ValidatedField id="edit-country" label="Country" required error={errors.country} value={form.country} touched={touched.country}>
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
              <ValidatedField id="edit-timezone" label="Timezone" required error={errors.timezone} value={form.timezone} touched={touched.timezone}>
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

              {/* Discord */}
              <ValidatedField id="edit-discordUsername" label="Discord username" error={errors.discordUsername} value={form.discordUsername} touched={touched.discordUsername}>
                <div className="relative">
                  <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="edit-discordUsername" value={form.discordUsername} onChange={(e) => setForm({ ...form, discordUsername: e.target.value })} onBlur={() => markTouched("discordUsername")} placeholder="username" className={cn("pl-10", bc("discordUsername", form.discordUsername))} aria-invalid={!!errors.discordUsername} />
                </div>
              </ValidatedField>

              {/* Portfolio & LinkedIn */}
              <ValidatedField id="edit-portfolio" label="Portfolio URL" value={form.portfolio_url} touched={touched.portfolio_url}>
                <Input id="edit-portfolio" type="url" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} placeholder="https://yourportfolio.com" maxLength={500} />
              </ValidatedField>
              <ValidatedField id="edit-linkedin" label="LinkedIn URL" value={form.linkedin_url} touched={touched.linkedin_url}>
                <Input id="edit-linkedin" type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/yourprofile" maxLength={500} />
              </ValidatedField>
            </div>
          </TabsContent>

          {/* ── Tab 2: Training Goals ── */}
          <TabsContent value="training-goals" className="space-y-6">
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
              <ValidatedField id="edit-goals" label="Professional development goals" value={form.professional_goals} touched={touched.professional_goals}>
                <Textarea
                  id="edit-goals"
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
            </div>
          </TabsContent>

          {/* ── Tab 3: Preferences ── */}
          <TabsContent value="preferences" className="space-y-6">
            <div className="card-elevated p-6 sm:p-8 space-y-6">
              <div className="space-y-4">
                <Label className="text-base font-semibold">Notification preferences</Label>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="edit-notify"
                    checked={form.notify_training_opportunities}
                    onCheckedChange={(checked) => setForm({ ...form, notify_training_opportunities: !!checked })}
                  />
                  <div>
                    <Label htmlFor="edit-notify" className="text-sm leading-relaxed cursor-pointer">
                      Notify me about training opportunities that match my preferences
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Receive in-app notifications when matching opportunities open.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="edit-notify-announcements"
                    checked={form.notify_announcements}
                    onCheckedChange={(checked) => setForm({ ...form, notify_announcements: !!checked })}
                  />
                  <div>
                    <Label htmlFor="edit-notify-announcements" className="text-sm leading-relaxed cursor-pointer">
                      Send me email notifications
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Receive emails about announcements and, if combined with the above, training opportunity alerts.</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 4: Account ── */}
          <TabsContent value="account" className="space-y-6">
            <div className="card-elevated p-6 sm:p-8 space-y-6">
              <div className="space-y-1.5">
                <Label>Password</Label>
                {isOAuth ? (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm text-muted-foreground">
                      You signed in with Google. Password management is handled by your Google account.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={handleResetPassword} disabled={resetPasswordLoading}>
                      <KeyRound className="h-4 w-4 mr-2" />
                      {resetPasswordLoading ? "Sending…" : "Reset Password"}
                    </Button>
                    <p className="text-xs text-muted-foreground">We'll send a reset link to your email.</p>
                  </div>
                )}
              </div>

              {/* Discord Account Link */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label>Link Your Discord Account</Label>
                {profile?.discord_user_id ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Discord linked</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Connected as <strong>{profile.discord_username}</strong>
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      Link your Discord account to automatically receive roles and channel access after joining the Tech Fleet Discord server.
                    </p>
                    {!form.discordUsername?.trim() ? (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                        <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-warning">
                          Enter your Discord username in the Basic Info tab first, then come back here to verify.
                        </p>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={discordLinking}
                        className="gap-2"
                        onClick={async () => {
                          if (!user?.id || !form.discordUsername?.trim()) return;
                          setDiscordLinking(true);
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            if (!session) throw new Error("Not authenticated");
                            const res = await supabase.functions.invoke("resolve-discord-id", {
                              body: { username: form.discordUsername.trim() },
                              headers: { Authorization: `Bearer ${session.access_token}` },
                            });
                            if (res.error) throw new Error(res.error.message || "Verification failed");
                            if (res.data?.error) throw new Error(res.data.error);
                            await refreshProfile();
                            toast.success("Discord account linked successfully!", {
                              description: `Verified as ${form.discordUsername}`,
                              duration: 5000,
                              position: "top-center",
                            });
                          } catch (err: any) {
                            toast.error(err.message || "Could not verify your Discord account. Make sure you've joined the Tech Fleet Discord server.", {
                              duration: 10000,
                              position: "top-center",
                            });
                          } finally {
                            setDiscordLinking(false);
                          }
                        }}
                      >
                        {discordLinking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
                          </svg>
                        )}
                        {discordLinking ? "Verifying…" : "Login to Discord"}
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-1.5 pt-2 border-t">
                <Label>Your Data</Label>
                <p className="text-xs text-muted-foreground mb-2">Download a complete copy of all your data stored on this platform (GDPR / HIPAA Right of Access).</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      toast.info("Preparing your data export…", { position: "top-center" });
                      const { data, error } = await supabase.rpc("export_my_data");
                      if (error) throw error;
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `techfleet-data-export-${new Date().toISOString().slice(0, 10)}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success("Data export downloaded.", { position: "top-center" });
                    } catch {
                      toast.error("Failed to export data. Please try again.", { position: "top-center" });
                    }
                  }}
                >
                  Export My Data
                </Button>
              </div>

              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-destructive">Danger zone</Label>
                <p className="text-xs text-muted-foreground mb-2">Once you delete your account, there is no going back. Please be certain.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => { setDeleteConfirmText(""); setDeleteDialogOpen(true); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </div>
          </TabsContent>
          </div>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 z-30 bg-background border-t px-4 sm:px-6 py-3">
          <div className="container-app max-w-3xl">
            <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Tabs>

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All of your data, including your profile, progress, and activity, will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="delete-confirm">
              Type <strong className="text-foreground">Delete</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Delete"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleteConfirmText !== "Delete" || deleting}>
              {deleting ? "Deleting…" : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
