import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  ClipboardList,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Globe,
  Clock,
  MessageCircle,
  Check,
  ChevronsUpDown,
  AlertCircle,
  Save,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileService } from "@/services/profile.service";
import {
  GeneralApplicationService,
  type GeneralApplication,
} from "@/services/general-application.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/lib/countries";
import { TIMEZONES } from "@/lib/timezones";
import {
  EXPERIENCE_AREAS,
  EDUCATION_OPTIONS,
  PREVIOUS_ENGAGEMENT_OPTIONS,
} from "@/lib/application-options";

// Single-instance: users have 0 or 1 general application
const TOTAL_SECTIONS = 5;

const SECTION_TITLES = [
  "Basic Information",
  "Review and Update Profile",
  "Previous Engagement in Tech Fleet",
  "Agile Questions",
  "Service Leadership Questions",
];

const experienceOptions: MultiSelectOption[] = EXPERIENCE_AREAS.map((e) => ({
  value: e,
  label: e,
}));
const educationOptions: MultiSelectOption[] = EDUCATION_OPTIONS.map((e) => ({
  value: e,
  label: e,
}));
const engagementOptions: MultiSelectOption[] = PREVIOUS_ENGAGEMENT_OPTIONS.map(
  (e) => ({ value: e, label: e })
);

interface AppFormData {
  // Section 1
  hours_commitment: string;
  portfolio_url: string;
  linkedin_url: string;
  // Section 2 (profile fields)
  country: string;
  timezone: string;
  discord_username: string;
  experience_areas: string[];
  professional_goals: string;
  notify_training_opportunities: boolean;
  education_background: string[];
  // Section 3
  previous_engagement: string;
  previous_engagement_ways: string[];
  teammate_learnings: string;
  // Section 4
  agile_vs_waterfall: string;
  psychological_safety: string;
  agile_philosophies: string;
  collaboration_challenges: string;
  // Section 5
  servant_leadership_definition: string;
  servant_leadership_actions: string;
  servant_leadership_challenges: string;
  servant_leadership_situation: string;
}

const emptyForm: AppFormData = {
  hours_commitment: "",
  portfolio_url: "",
  linkedin_url: "",
  country: "",
  timezone: "",
  discord_username: "",
  experience_areas: [],
  professional_goals: "",
  notify_training_opportunities: false,
  education_background: [],
  previous_engagement: "",
  previous_engagement_ways: [],
  teammate_learnings: "",
  agile_vs_waterfall: "",
  psychological_safety: "",
  agile_philosophies: "",
  collaboration_challenges: "",
  servant_leadership_definition: "",
  servant_leadership_actions: "",
  servant_leadership_challenges: "",
  servant_leadership_situation: "",
};

export function GeneralApplicationTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeApp, setActiveApp] = useState<GeneralApplication | null>(null);
  const [form, setForm] = useState<AppFormData>({ ...emptyForm });
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sectionsTouched, setSectionsTouched] = useState<Set<number>>(new Set());
  const [countryOpen, setCountryOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const formContainerRef = useRef<HTMLDivElement>(null);

  const updateField = <K extends keyof AppFormData>(key: K, value: AppFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error for this field as user corrects it
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  /** Load or create the single general application */
  const loadOrCreateApp = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await GeneralApplicationService.list(user.id);
      if (data.length > 0) {
        // Use existing app
        const app = data[0];
        setActiveApp(app);
        populateFormFromApp(app);
      } else {
        // Create the user's first (and only) app
        const app = await GeneralApplicationService.create(user.id);
        setActiveApp(app);
        populateFormFromApp(app);
      }
    } catch {
      toast.error("Failed to load application");
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    loadOrCreateApp();
  }, [loadOrCreateApp]);

  const populateFormFromApp = (app: GeneralApplication) => {
    setForm({
      hours_commitment: app.hours_commitment || "",
      portfolio_url: app.portfolio_url || "",
      linkedin_url: app.linkedin_url || "",
      country: profile?.country || "",
      timezone: profile?.timezone || "",
      discord_username: profile?.discord_username || "",
      experience_areas: profile?.experience_areas || [],
      professional_goals: profile?.professional_goals || "",
      notify_training_opportunities: profile?.notify_training_opportunities || false,
      education_background: profile?.education_background || [],
      previous_engagement: app.previous_engagement || "",
      previous_engagement_ways: app.previous_engagement_ways || [],
      teammate_learnings: app.teammate_learnings || "",
      agile_vs_waterfall: app.agile_vs_waterfall || "",
      psychological_safety: app.psychological_safety || "",
      agile_philosophies: app.agile_philosophies || "",
      collaboration_challenges: app.collaboration_challenges || "",
      servant_leadership_definition: app.servant_leadership_definition || "",
      servant_leadership_actions: app.servant_leadership_actions || "",
      servant_leadership_challenges: app.servant_leadership_challenges || "",
      servant_leadership_situation: app.servant_leadership_situation || "",
    });
    setTitle(app.title);
    setSection(app.current_section > 0 ? Math.min(app.current_section, TOTAL_SECTIONS) : 1);
  };

  const gatherSaveFields = (): Partial<GeneralApplication> => ({
    title,
    hours_commitment: form.hours_commitment,
    portfolio_url: form.portfolio_url,
    linkedin_url: form.linkedin_url,
    previous_engagement: form.previous_engagement,
    previous_engagement_ways: form.previous_engagement_ways,
    teammate_learnings: form.teammate_learnings,
    agile_vs_waterfall: form.agile_vs_waterfall,
    psychological_safety: form.psychological_safety,
    agile_philosophies: form.agile_philosophies,
    collaboration_challenges: form.collaboration_challenges,
    servant_leadership_definition: form.servant_leadership_definition,
    servant_leadership_actions: form.servant_leadership_actions,
    servant_leadership_challenges: form.servant_leadership_challenges,
    servant_leadership_situation: form.servant_leadership_situation,
    current_section: section,
  });

  /** Save profile fields from Section 2 */
  const syncProfileFields = async () => {
    if (!user) return;
    try {
      await ProfileService.updateFields(user.id, {
        country: form.country,
        timezone: form.timezone,
        discord_username: form.discord_username,
        experience_areas: form.experience_areas,
        professional_goals: form.professional_goals,
        notify_training_opportunities: form.notify_training_opportunities,
        education_background: form.education_background,
      });
      await refreshProfile();
    } catch {
      // Non-blocking
    }
  };

  const isCompleted = activeApp?.status === "completed";

  const handleSave = async (markComplete = false) => {
    if (!activeApp) return;
    setSaving(true);
    try {
      const fields = gatherSaveFields();
      if (markComplete) {
        fields.status = "completed";
      } else if (!isCompleted) {
        // Only revert to draft if not already completed (allow updates to completed apps)
        fields.status = "draft";
      }
      await GeneralApplicationService.save(activeApp.id, fields);
      await syncProfileFields();
      const updated = await GeneralApplicationService.fetch(activeApp.id);
      if (updated) setActiveApp(updated);

      if (markComplete && !isCompleted) {
        // First-time completion: celebrate!
        setShowCelebration(true);
      } else {
        toast.success(markComplete ? "Application updated!" : "Progress saved");
      }
    } catch {
      toast.error("Failed to save application");
    } finally {
      setSaving(false);
    }
  };

  /** Validate a specific section's fields without side effects */
  const getFieldErrors = (s: number): Record<string, string> => {
    const fieldErrors: Record<string, string> = {};
    if (s === 1) {
      if (!form.hours_commitment) fieldErrors.hours_commitment = "Please select an option";
    }
    if (s === 2) {
      if (!form.country.trim()) fieldErrors.country = "Country is required";
      if (!form.timezone.trim()) fieldErrors.timezone = "Timezone is required";
      if (form.experience_areas.length === 0) fieldErrors.experience_areas = "Please select at least one area or 'I'm not sure yet'";
      if (!form.professional_goals.trim()) fieldErrors.professional_goals = "Professional goals are required";
      if (form.education_background.length === 0) fieldErrors.education_background = "Please select at least one option";
    }
    if (s === 3) {
      if (!form.previous_engagement) fieldErrors.previous_engagement = "Please select an option";
      if (form.previous_engagement === "yes" && form.previous_engagement_ways.length === 0) {
        fieldErrors.previous_engagement_ways = "Please select at least one engagement type";
      }
    }
    if (s === 4) {
      if (!form.agile_vs_waterfall.trim()) fieldErrors.agile_vs_waterfall = "This field is required";
      if (!form.psychological_safety.trim()) fieldErrors.psychological_safety = "This field is required";
      if (!form.agile_philosophies.trim()) fieldErrors.agile_philosophies = "This field is required";
      if (!form.collaboration_challenges.trim()) fieldErrors.collaboration_challenges = "This field is required";
    }
    if (s === 5) {
      if (!form.servant_leadership_definition.trim()) fieldErrors.servant_leadership_definition = "This field is required";
      if (!form.servant_leadership_actions.trim()) fieldErrors.servant_leadership_actions = "This field is required";
      if (!form.servant_leadership_challenges.trim()) fieldErrors.servant_leadership_challenges = "This field is required";
      if (!form.servant_leadership_situation.trim()) fieldErrors.servant_leadership_situation = "This field is required";
    }
    return fieldErrors;
  };

  const validateSection = (): boolean => {
    const fieldErrors = getFieldErrors(section);
    setSectionsTouched((prev) => new Set(prev).add(section));
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) {
      const errorCount = Object.keys(fieldErrors).length;
      toast.error(`Please fix ${errorCount} required ${errorCount === 1 ? "field" : "fields"} before continuing`, {
        description: Object.values(fieldErrors).join(", "),
      });
      // Scroll to the error summary banner
      requestAnimationFrame(() => {
        const firstError = formContainerRef.current?.querySelector('[role="alert"]');
        firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (!validateSection()) return;
    // Auto-save when moving forward
    if (activeApp) {
      setSaving(true);
      try {
        const fields = gatherSaveFields();
        fields.current_section = section + 1;
        fields.status = "draft";
        await GeneralApplicationService.save(activeApp.id, fields);
        await syncProfileFields();
        const updated = await GeneralApplicationService.fetch(activeApp.id);
        if (updated) setActiveApp(updated);
      } catch { /* non-blocking */ }
      setSaving(false);
    }
    setSection((s) => Math.min(s + 1, TOTAL_SECTIONS));
    setErrors({});
  };

  const handleBack = () => {
    setErrors({});
    setSection((s) => Math.max(s - 1, 1));
  };

  const canSubmit = (): boolean => {
    return !!(
      form.hours_commitment &&
      form.country.trim() &&
      form.timezone.trim() &&
      form.experience_areas.length > 0 &&
      form.professional_goals.trim() &&
      form.education_background.length > 0 &&
      form.previous_engagement &&
      (form.previous_engagement !== "yes" || form.previous_engagement_ways.length > 0) &&
      form.agile_vs_waterfall.trim() &&
      form.psychological_safety.trim() &&
      form.agile_philosophies.trim() &&
      form.collaboration_challenges.trim() &&
      form.servant_leadership_definition.trim() &&
      form.servant_leadership_actions.trim() &&
      form.servant_leadership_challenges.trim() &&
      form.servant_leadership_situation.trim()
    );
  };

  // ─── LOADING STATE ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── FORM VIEW ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link to="/applications" className="text-muted-foreground hover:text-foreground transition-colors">
          Applications
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-foreground truncate">
          General Application
        </span>
        {activeApp && (
          <Badge
            variant={activeApp.status === "completed" ? "default" : "secondary"}
            className={cn("ml-2", activeApp.status === "completed" && "bg-success/10 text-success border-success/30")}
          >
            {activeApp.status === "completed" ? "Completed" : "Draft"}
          </Badge>
        )}
      </nav>

      {/* Section navigation tabs */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Application sections">
        {SECTION_TITLES.map((t, i) => {
          const sNum = i + 1;
          const isCurrent = section === sNum;
          const hasErrors = sectionsTouched.has(sNum) && Object.keys(getFieldErrors(sNum)).length > 0;
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-label={`Section ${sNum}: ${t}${hasErrors ? " (has errors)" : ""}`}
              onClick={() => { setErrors({}); setSection(sNum); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors border relative",
                isCurrent
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80",
                hasErrors && !isCurrent && "border-destructive/60"
              )}
            >
              {sNum}. {t}
              {hasErrors && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(section / TOTAL_SECTIONS) * 100}%` }} />
      </div>

      <div className="card-elevated p-6 space-y-5" ref={formContainerRef}>
        {/* Error summary banner */}
        {Object.keys(errors).length > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex gap-3" role="alert" aria-live="assertive">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                Please fix {Object.keys(errors).length} {Object.keys(errors).length === 1 ? "error" : "errors"} to continue
              </p>
              <ul className="text-sm text-destructive/90 list-disc list-inside space-y-0.5">
                {Object.values(errors).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold text-foreground">Section {section}: {SECTION_TITLES[section - 1]}</h2>
          {section === 2 && (
            <p className="text-sm text-muted-foreground mt-1">
              Here are some questions that are stored in your profile. Feel free to update them while you're filling out the general application.
            </p>
          )}
        </div>

        {/* ─── SECTION 1: Basic Information ─── */}
        {section === 1 && (
          <div className="space-y-5">
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Tech Fleet project trainees are expected to commit 15 to 20 hours on project team training. This is flexible, and your team builds the schedule together based on their availability. Are you committed to contribute 15 to 20 hours a week during project training? <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-col gap-2">
                {["yes", "no", "not_sure"].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateField("hours_commitment", val)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border-2 transition-all",
                      form.hours_commitment === val ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {val === "yes" ? "Yes" : val === "no" ? "No" : "I'm not sure"}
                    </span>
                  </button>
                ))}
              </div>
              {errors.hours_commitment && (
                <p className="text-sm text-destructive flex items-center gap-1" role="alert">
                  <AlertCircle className="h-3 w-3" /> {errors.hours_commitment}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-portfolio">Portfolio URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="app-portfolio"
                type="url"
                value={form.portfolio_url}
                onChange={(e) => updateField("portfolio_url", e.target.value)}
                placeholder="https://yourportfolio.com"
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-linkedin">LinkedIn URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="app-linkedin"
                type="url"
                value={form.linkedin_url}
                onChange={(e) => updateField("linkedin_url", e.target.value)}
                placeholder="https://linkedin.com/in/yourprofile"
                maxLength={500}
              />
            </div>
          </div>
        )}

        {/* ─── SECTION 2: Review and Update Profile ─── */}
        {section === 2 && (
          <div className="space-y-5">
            {/* Location */}
            <div className="space-y-2">
              <Label>Location <span className="text-destructive">*</span></Label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryOpen}
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
                          <CommandItem key={c.code} value={c.name} onSelect={() => { updateField("country", c.name); setCountryOpen(false); }}>
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

            {/* Discord */}
            <div className="space-y-2">
              <Label htmlFor="app-discord">Discord Username</Label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="app-discord"
                  value={form.discord_username}
                  onChange={(e) => updateField("discord_username", e.target.value)}
                  placeholder="username"
                  className="pl-10"
                  maxLength={100}
                />
              </div>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label>Timezone <span className="text-destructive">*</span></Label>
              <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={timezoneOpen}
                    className={cn("w-full justify-between pl-10 relative font-normal", !form.timezone && "text-muted-foreground")}
                    aria-invalid={!!errors.timezone}
                  >
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
                          <CommandItem key={tz.value} value={tz.label} onSelect={() => { updateField("timezone", tz.value); setTimezoneOpen(false); }}>
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

            {/* Experience Areas */}
            <div className="space-y-2">
              <Label>In what areas do you want to gain experience on Tech Fleet's training programs? <span className="text-destructive">*</span></Label>
              <MultiSelect
                options={experienceOptions}
                selected={form.experience_areas}
                onChange={(v) => updateField("experience_areas", v)}
                placeholder="Search and select areas..."
                emptyMessage="No specializations found."
                aria-label="Experience areas"
                aria-invalid={!!errors.experience_areas}
              />
              {errors.experience_areas && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.experience_areas}</p>}
            </div>

            {/* Professional Goals */}
            <div className="space-y-2">
              <Label htmlFor="app-goals">Tell us more about the professional development goals you want to achieve <span className="text-destructive">*</span></Label>
              <Textarea
                id="app-goals"
                value={form.professional_goals}
                onChange={(e) => updateField("professional_goals", e.target.value)}
                placeholder="Describe your professional development goals..."
                className="min-h-[120px] resize-y"
                maxLength={5000}
                aria-invalid={!!errors.professional_goals}
              />
              <p className="text-xs text-muted-foreground text-right">{form.professional_goals.length} / 5,000</p>
              {errors.professional_goals && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.professional_goals}</p>}
            </div>

            {/* Notify */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="app-notify"
                checked={form.notify_training_opportunities}
                onCheckedChange={(checked) => updateField("notify_training_opportunities", !!checked)}
              />
              <Label htmlFor="app-notify" className="text-sm leading-relaxed cursor-pointer">
                Would you like us to notify you in the application when there are training opportunities that match your preferences?
              </Label>
            </div>

            {/* Education */}
            <div className="space-y-2">
              <Label>What best describes your current or previous education? <span className="text-destructive">*</span></Label>
              <MultiSelect
                options={educationOptions}
                selected={form.education_background}
                onChange={(v) => updateField("education_background", v)}
                placeholder="Search and select education..."
                emptyMessage="No options found."
                aria-label="Education background"
                aria-invalid={!!errors.education_background}
              />
              {errors.education_background && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.education_background}</p>}
            </div>
          </div>
        )}

        {/* ─── SECTION 3: Previous Engagement ─── */}
        {section === 3 && (
          <div className="space-y-5">
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Have you previously engaged in Tech Fleet community before? <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-col gap-2">
                {["yes", "no"].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      updateField("previous_engagement", val);
                      if (val === "no") updateField("previous_engagement_ways", []);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border-2 transition-all",
                      form.previous_engagement === val ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="font-medium text-foreground">{val === "yes" ? "Yes" : "No"}</span>
                  </button>
                ))}
              </div>
              {errors.previous_engagement && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.previous_engagement}</p>}
            </div>

            {form.previous_engagement === "yes" && (
              <div className="space-y-2">
                <Label>In what ways have you previously engaged in the Tech Fleet community so far? <span className="text-destructive">*</span></Label>
                <MultiSelect
                  options={engagementOptions}
                  selected={form.previous_engagement_ways}
                  onChange={(v) => updateField("previous_engagement_ways", v)}
                  placeholder="Search and select engagement types..."
                  emptyMessage="No options found."
                  aria-label="Previous engagement ways"
                  aria-invalid={!!errors.previous_engagement_ways}
                />
                {errors.previous_engagement_ways && <p className="text-sm text-destructive flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3" /> {errors.previous_engagement_ways}</p>}
              </div>
            )}

            {form.previous_engagement === "yes" && (
              <div className="space-y-2">
                <Label htmlFor="app-teammate-learnings">What have you learned about being a teammate after engaging in Tech Fleet so far?</Label>
                <Textarea
                  id="app-teammate-learnings"
                  value={form.teammate_learnings}
                  onChange={(e) => updateField("teammate_learnings", e.target.value)}
                  placeholder="Share what you've learned about teamwork..."
                  className="min-h-[120px] resize-y"
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground text-right">{form.teammate_learnings.length} / 5,000</p>
              </div>
            )}
          </div>
        )}

        {/* ─── SECTION 4: Agile Questions ─── */}
        {section === 4 && (
          <div className="space-y-5">
            <LongFormQuestion
              id="agile-waterfall"
              label="What's the difference between Agile and Waterfall methods?"
              value={form.agile_vs_waterfall}
              onChange={(v) => updateField("agile_vs_waterfall", v)}
              error={errors.agile_vs_waterfall}
              required
            />
            <LongFormQuestion
              id="psych-safety"
              label="How do you approach building psychologically safe environments on teams as a teammate?"
              value={form.psychological_safety}
              onChange={(v) => updateField("psychological_safety", v)}
              error={errors.psychological_safety}
              required
            />
            <LongFormQuestion
              id="agile-philosophies"
              label="How do you apply the Agile philosophies in your day-to-day work while working on teams?"
              value={form.agile_philosophies}
              onChange={(v) => updateField("agile_philosophies", v)}
              error={errors.agile_philosophies}
              required
            />
            <LongFormQuestion
              id="collab-challenges"
              label="What, if any, challenges have you faced while collaborating with different people teams? How have you tried to solve those challenges?"
              value={form.collaboration_challenges}
              onChange={(v) => updateField("collaboration_challenges", v)}
              error={errors.collaboration_challenges}
              required
            />
          </div>
        )}

        {/* ─── SECTION 5: Service Leadership ─── */}
        {section === 5 && (
          <div className="space-y-5">
            <LongFormQuestion
              id="sl-definition"
              label="What is Service Leadership to you?"
              value={form.servant_leadership_definition}
              onChange={(v) => updateField("servant_leadership_definition", v)}
              error={errors.servant_leadership_definition}
              required
            />
            <LongFormQuestion
              id="sl-actions"
              label="In what ways would you / do you act as a Servant Leader to yourself and others on teams as a cross-functional teammate?"
              value={form.servant_leadership_actions}
              onChange={(v) => updateField("servant_leadership_actions", v)}
              error={errors.servant_leadership_actions}
              required
            />
            <LongFormQuestion
              id="sl-challenges"
              label="What challenges do you currently face in Servant Leadership that you are working on?"
              value={form.servant_leadership_challenges}
              onChange={(v) => updateField("servant_leadership_challenges", v)}
              error={errors.servant_leadership_challenges}
              required
            />
            <LongFormQuestion
              id="sl-situation"
              label="What would you do in a situation where a person on a team is not acting as a servant leader to you or to others?"
              value={form.servant_leadership_situation}
              onChange={(v) => updateField("servant_leadership_situation", v)}
              error={errors.servant_leadership_situation}
              required
            />
          </div>
        )}
      </div>

      {/* Navigation & Save */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {section > 1 && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Previous
            </Button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : isCompleted ? "Save Changes" : "Save Draft"}
          </Button>
          {section < TOTAL_SECTIONS ? (
            <Button onClick={handleNext} disabled={saving}>
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => handleSave(true)} disabled={saving || !canSubmit()}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {saving ? "Submitting…" : isCompleted ? "Update Application" : "Submit Application"}
            </Button>
          )}
        </div>
      </div>

      {/* 🎉 Celebration dialog on first completion */}
      <Dialog open={showCelebration} onOpenChange={setShowCelebration}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader className="items-center">
            <div className="text-5xl mb-2">🎉</div>
            <DialogTitle className="text-xl">
              General Application Submitted!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Congratulations! Your general application has been submitted successfully.
              You can update it anytime from the Applications page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => setShowCelebration(false)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Reusable long-form text question component */
function LongFormQuestion({
  id,
  label,
  value,
  onChange,
  error,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-base font-medium leading-relaxed">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[120px] resize-y"
        maxLength={5000}
        aria-invalid={!!error}
        aria-describedby={`${id}-count`}
      />
      <p id={`${id}-count`} className="text-xs text-muted-foreground text-right">{value.length} / 5,000</p>
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1" role="alert">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
