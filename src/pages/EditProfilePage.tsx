import { useState, useEffect, useLayoutEffect, useCallback, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertCircle, User, Globe, MessageCircle, Check, ChevronsUpDown,
  Mail, Trash2, KeyRound, Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import { AuthService } from "@/services/auth.service";
import { profileSchema, ACTIVITY_OPTIONS } from "@/lib/validators/profile";
import { EXPERIENCE_AREAS, EDUCATION_OPTIONS } from "@/lib/application-options";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { AvatarUpload } from "@/components/AvatarUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePageHeader } from "@/contexts/PageHeaderContext";

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
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState("basic-info");

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
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);

      // Map fields to their tab and input id
      const fieldToTab: Record<string, string> = {
        firstName: "basic-info", lastName: "basic-info", country: "basic-info",
        timezone: "basic-info", discordUsername: "basic-info", email: "basic-info",
        interests: "training-goals", experience_areas: "training-goals",
        education_background: "training-goals", professional_goals: "training-goals",
      };
      const fieldToId: Record<string, string> = {
        firstName: "edit-firstName", lastName: "edit-lastName",
        email: "edit-email", discordUsername: "edit-discordUsername",
        professional_goals: "edit-professional-goals",
      };

      // Build human-readable labels for the toast
      const fieldLabels: Record<string, string> = {
        firstName: "First name", lastName: "Last name", country: "Country",
        timezone: "Timezone", discordUsername: "Discord username", email: "Email",
      };
      const errorLabels = Object.keys(fieldErrors).map((f) => fieldLabels[f] || f);
      toast.error("Please fix the following errors", {
        description: errorLabels.join(", "),
      });

      // Switch to the tab containing the first error field and scroll to it
      const firstField = Object.keys(fieldErrors)[0];
      const targetTab = fieldToTab[firstField];
      if (targetTab) {
        setActiveTab(targetTab);
        // Wait for tab content to render, then scroll
        setTimeout(() => {
          const targetId = fieldToId[firstField];
          const el = targetId
            ? document.getElementById(targetId)
            : document.querySelector(`[aria-invalid="true"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (el && "focus" in el) (el as HTMLElement).focus();
        }, 100);
      }
      return;
    }

    if (!isOAuth) {
      if (!form.email.trim()) { setErrors({ email: "Email is required" }); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErrors({ email: "Please enter a valid email" }); return; }
    }

    setErrors({});
    setSaving(true);
    try {
      await ProfileService.update(user!.id, result.data, !isOAuth ? form.email.trim() : undefined);
      setInitialized(false); // allow useEffect to re-sync form with fresh profile
      await refreshProfile();
      toast.success("Profile updated successfully");
    } catch (err: any) {
      setErrors({ general: err.message });
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
      });
    } catch {
      toast.info("If an account exists with that email, a reset link has been sent.");
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
      toast.success("Your account has been deleted.");
      setDeleteDialogOpen(false);
      await supabase.auth.signOut({ scope: "local" });
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  /* ── Push page context into the global header ── */
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
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="edit-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => !isOAuth && setForm({ ...form, email: e.target.value })}
                    readOnly={!!isOAuth}
                    disabled={!!isOAuth}
                    className={cn("pl-10", isOAuth && "bg-muted/50")}
                    aria-invalid={!!errors.email}
                  />
                </div>
                {isOAuth ? (
                  <p className="text-xs text-muted-foreground">Email is managed by your Google account.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Update your contact email address.</p>
                )}
                {errors.email && (
                  <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                    <AlertCircle className="h-3 w-3" /> {errors.email}
                  </p>
                )}
              </div>

              {/* First name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-firstName">First name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="edit-firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jane" className="pl-10" required aria-invalid={!!errors.firstName} />
                </div>
                {errors.firstName && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.firstName}</p>}
              </div>

              {/* Last name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-lastName">Last name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="edit-lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" className="pl-10" required aria-invalid={!!errors.lastName} />
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
                <Label htmlFor="edit-discordUsername">Discord username</Label>
                <div className="relative">
                  <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="edit-discordUsername" value={form.discordUsername} onChange={(e) => setForm({ ...form, discordUsername: e.target.value })} placeholder="username" className="pl-10" aria-invalid={!!errors.discordUsername} />
                </div>
                {errors.discordUsername && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.discordUsername}</p>}
              </div>

              {/* Portfolio & LinkedIn */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-portfolio">Portfolio URL</Label>
                <Input id="edit-portfolio" type="url" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} placeholder="https://yourportfolio.com" maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
                <Input id="edit-linkedin" type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/yourprofile" maxLength={500} />
              </div>
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
                <MultiSelect
                  options={EXPERIENCE_AREAS.map((e) => ({ value: e, label: e }))}
                  selected={form.experience_areas}
                  onChange={(v) => setForm({ ...form, experience_areas: v })}
                  placeholder="Search and select areas..."
                  aria-label="Experience areas"
                />
              </div>

              {/* Professional Goals */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-goals">Professional development goals</Label>
                <Textarea
                  id="edit-goals"
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
          </TabsContent>

          {/* ── Tab 3: Preferences ── */}
          <TabsContent value="preferences" className="space-y-6">
            <div className="card-elevated p-6 sm:p-8 space-y-6">
              {/* Notifications */}
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
              {/* Password Reset */}
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

              {/* Delete Account */}
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
