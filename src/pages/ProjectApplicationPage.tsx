import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, CheckCircle2, Globe, User, ExternalLink,
  PartyPopper, ChevronRight,
} from "lucide-react";
import { StepProgressBar } from "@/components/StepProgressBar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  PROJECT_TYPES, PROJECT_PHASES, TEAM_HATS,
} from "@/data/project-constants";
import { format } from "date-fns";

/* ── types ─────────────────────────────────────────────────── */
interface ProjectApp {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
  current_step: number;
  team_hats_interest: string[];
  participated_previous_phase: boolean;
  previous_phase_position: string;
  previous_phase_learnings: string;
  previous_phase_help_teammates: string;
  prior_engagement_preparation: string;
  passion_for_project: string;
  client_project_knowledge: string;
  cross_functional_contribution: string;
  project_success_contribution: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectInfo {
  id: string;
  client_id: string;
  project_type: string;
  phase: string;
  project_status: string;
  team_hats: string[];
  current_phase_milestones: string[];
}

interface ClientInfo {
  id: string;
  name: string;
  website: string;
  mission: string;
  project_summary: string;
  primary_contact: string;
}

const STEP_LABELS = ["Review General App", "Project Questions", "Client Questions"];

/* ── read-only display helpers ───────────────────────────── */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const hasValue = !!value?.trim();
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className={`text-sm whitespace-pre-wrap leading-relaxed ${hasValue ? "text-muted-foreground" : "text-muted-foreground/50 italic"}`}>
        {hasValue ? value : "Not provided"}
      </p>
    </div>
  );
}

function ReadOnlyArrayField({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="text-xs">{item}</Badge>
        ))}
      </div>
    </div>
  );
}

/* ── component ────────────────────────────────────────────── */
export default function ProjectApplicationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* form state */
  const [teamHatsInterest, setTeamHatsInterest] = useState<string[]>([]);
  const [participatedPrev, setParticipatedPrev] = useState(false);
  const [prevPosition, setPrevPosition] = useState("");
  const [prevLearnings, setPrevLearnings] = useState("");
  const [prevHelpTeammates, setPrevHelpTeammates] = useState("");
  const [priorPreparation, setPriorPreparation] = useState("");
  const [passion, setPassion] = useState("");
  const [clientKnowledge, setClientKnowledge] = useState("");
  const [crossFunctional, setCrossFunctional] = useState("");
  const [successContribution, setSuccessContribution] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  /* ── fetch project info ────────────────────────────────── */
  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("*").eq("id", projectId!).single();
      if (error) throw error;
      return data as unknown as ProjectInfo;
    },
    enabled: !!projectId,
  });

  const { data: client } = useQuery({
    queryKey: ["client-detail", project?.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").eq("id", project!.client_id).single();
      if (error) throw error;
      return data as unknown as ClientInfo;
    },
    enabled: !!project?.client_id,
  });

  /* ── fetch user's general application ──────────────────── */
  const { data: genApp } = useQuery({
    queryKey: ["general-app-for-review", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_applications")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    enabled: !!user,
  });

  /* ── fetch user's profile for step 1 review ───────────── */
  const { data: userProfile } = useQuery({
    queryKey: ["profile-for-review", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    enabled: !!user,
  });

  const { data: existingApp, isLoading: appLoading } = useQuery({
    queryKey: ["project-application", user?.id, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_applications")
        .select("*")
        .eq("user_id", user!.id)
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProjectApp | null;
    },
    enabled: !!user && !!projectId,
  });

  /* populate form from existing app */
  useEffect(() => {
    if (existingApp && !initialized) {
      setTeamHatsInterest(existingApp.team_hats_interest ?? []);
      setParticipatedPrev(existingApp.participated_previous_phase ?? false);
      setPrevPosition(existingApp.previous_phase_position ?? "");
      setPrevLearnings(existingApp.previous_phase_learnings ?? "");
      setPrevHelpTeammates(existingApp.previous_phase_help_teammates ?? "");
      setPriorPreparation(existingApp.prior_engagement_preparation ?? "");
      setPassion(existingApp.passion_for_project ?? "");
      setClientKnowledge(existingApp.client_project_knowledge ?? "");
      setCrossFunctional(existingApp.cross_functional_contribution ?? "");
      setSuccessContribution(existingApp.project_success_contribution ?? "");
      setStep(existingApp.status === "completed" ? 1 : existingApp.current_step);
      setInitialized(true);
    }
    if (!existingApp && !appLoading && !initialized) {
      setInitialized(true);
    }
  }, [existingApp, appLoading, initialized]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  const isCompleted = existingApp?.status === "completed";

  /* ── available team hats scoped to project ─────────────── */
  const availableHats = useMemo(
    () => (project?.team_hats ?? TEAM_HATS.map(String)).map((h) => ({ label: h, value: h })),
    [project],
  );

  /* ── collect form data ─────────────────────────────────── */
  const collectFields = useCallback(() => ({
    team_hats_interest: teamHatsInterest,
    participated_previous_phase: participatedPrev,
    previous_phase_position: prevPosition,
    previous_phase_learnings: prevLearnings,
    previous_phase_help_teammates: prevHelpTeammates,
    prior_engagement_preparation: priorPreparation,
    passion_for_project: passion,
    client_project_knowledge: clientKnowledge,
    cross_functional_contribution: crossFunctional,
    project_success_contribution: successContribution,
  }), [teamHatsInterest, participatedPrev, prevPosition, prevLearnings, prevHelpTeammates, priorPreparation, passion, clientKnowledge, crossFunctional, successContribution]);

  /* ── save draft mutation ───────────────────────────────── */
  const saveMutation = useMutation({
    mutationFn: async (opts: { fields: Record<string, unknown>; newStep?: number; submit?: boolean }) => {
      const payload: Record<string, unknown> = {
        ...opts.fields,
        current_step: opts.newStep ?? step,
      };
      if (opts.submit) {
        payload.status = "completed";
        payload.completed_at = new Date().toISOString();
      }

      if (existingApp) {
        const { error } = await supabase
          .from("project_applications")
          .update(payload as any)
          .eq("id", existingApp.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("project_applications")
          .insert({
            user_id: user!.id,
            project_id: projectId!,
            ...payload,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["project-application", user?.id, projectId] });
      if (vars.submit) {
        setCelebrationOpen(true);
      } else {
        toast.success("Draft saved — you can resume anytime");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ── validation ────────────────────────────────────────── */
  const validateStep2 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (teamHatsInterest.length === 0) errs.team_hats_interest = "Select at least one team hat";
    if (participatedPrev) {
      if (!prevPosition.trim()) errs.previous_phase_position = "Required";
      if (!prevLearnings.trim()) errs.previous_phase_learnings = "Required";
      if (!prevHelpTeammates.trim()) errs.previous_phase_help_teammates = "Required";
    } else {
      if (!priorPreparation.trim()) errs.prior_engagement_preparation = "Required";
    }
    return errs;
  }, [teamHatsInterest, participatedPrev, prevPosition, prevLearnings, prevHelpTeammates, priorPreparation]);

  const validateStep3 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!passion.trim()) errs.passion_for_project = "Required";
    if (!clientKnowledge.trim()) errs.client_project_knowledge = "Required";
    if (!crossFunctional.trim()) errs.cross_functional_contribution = "Required";
    if (!successContribution.trim()) errs.project_success_contribution = "Required";
    return errs;
  }, [passion, clientKnowledge, crossFunctional, successContribution]);

  /* ── navigation ────────────────────────────────────────── */
  const handleNext = useCallback(() => {
    if (step === 1) {
      saveMutation.mutate({ fields: collectFields(), newStep: 2 });
      setStep(2);
      return;
    }
    if (step === 2) {
      const errs = validateStep2();
      if (Object.keys(errs).length > 0) { setErrors(errs); return; }
      setErrors({});
      saveMutation.mutate({ fields: collectFields(), newStep: 3 });
      setStep(3);
      return;
    }
    if (step === 3) {
      const errs2 = validateStep2();
      const errs3 = validateStep3();
      const allErrs = { ...errs2, ...errs3 };
      if (Object.keys(allErrs).length > 0) { setErrors(allErrs); return; }
      setErrors({});
      saveMutation.mutate({ fields: collectFields(), submit: true });
    }
  }, [step, collectFields, saveMutation, validateStep2, validateStep3]);

  const handleSubmit = useCallback(() => {
    const errs2 = validateStep2();
    const errs3 = validateStep3();
    const allErrs = { ...errs2, ...errs3 };
    if (Object.keys(allErrs).length > 0) { setErrors(allErrs); return; }
    setErrors({});
    saveMutation.mutate({ fields: collectFields(), submit: true });
  }, [collectFields, validateStep2, validateStep3, saveMutation]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      saveMutation.mutate({ fields: collectFields(), newStep: step - 1 });
      setStep(step - 1);
    }
  }, [step, collectFields, saveMutation]);

  const handleSaveDraft = useCallback(() => {
    saveMutation.mutate({ fields: collectFields(), newStep: step });
  }, [collectFields, step, saveMutation]);

  const handleSaveCompleted = useCallback(() => {
    const errs2 = validateStep2();
    const errs3 = validateStep3();
    const allErrs = { ...errs2, ...errs3 };
    if (Object.keys(allErrs).length > 0) { setErrors(allErrs); toast.error("Please fix validation errors"); return; }
    setErrors({});
    saveMutation.mutate({ fields: collectFields(), submit: true });
  }, [collectFields, validateStep2, validateStep3, saveMutation]);

  /* Check if all fields are filled for submit button state */
  const isSubmitReady = useMemo(() => {
    const errs2 = validateStep2();
    const errs3 = validateStep3();
    return Object.keys(errs2).length === 0 && Object.keys(errs3).length === 0;
  }, [validateStep2, validateStep3]);

  /* ── helpers ───────────────────────────────────────────── */
  const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
  const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;

  if (projLoading || appLoading || !initialized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container-app py-12 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/project-openings")}>
          Back to Openings
        </Button>
      </div>
    );
  }

  const isSaving = saveMutation.isPending;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────── */}
      <div className="shrink-0 border-b bg-background px-4 sm:px-6 py-4 space-y-4 max-w-3xl w-full mx-auto">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/project-openings">Project Openings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Apply — {client?.name ?? "Project"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Title */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/project-openings")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Project Application
            </h1>
            <p className="text-sm text-muted-foreground">
              {client?.name} — {typeLabel(project.project_type)} · {phaseLabel(project.phase)}
            </p>
          </div>
        </div>

        {/* Completion banner */}
        {isCompleted && existingApp?.completed_at && (
          <div className="rounded-lg border bg-success/10 border-success/30 p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Application Submitted</p>
              <p className="text-xs text-muted-foreground">
                Submitted on {format(new Date(existingApp.completed_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          </div>
        )}

        {/* Step progress */}
        <StepProgressBar
          steps={STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const status = isCompleted || step > stepNum
              ? "completed"
              : step === stepNum
                ? "started"
                : "not_started";
            return { label, status };
          })}
          currentStep={step}
          onStepClick={(s) => {
            if (isCompleted || s <= step) setStep(s);
          }}
        />
      </div>

      {/* ── Scrollable Content ────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Project info card (always visible) */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{client?.name}</p>
                  <p className="text-sm text-muted-foreground">{typeLabel(project.project_type)} · {phaseLabel(project.phase)}</p>
                </div>
                <Badge className="bg-warning/10 text-warning border-warning/20 shrink-0">Apply Now</Badge>
              </div>
              {client && (
                <div className="space-y-2 text-sm pt-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                      {(() => { try { return new URL(client.website).hostname; } catch { return client.website; } })()}
                      <ExternalLink className="h-3 w-3 inline ml-1" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{client.primary_contact}</span>
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Team Hats</p>
                <div className="flex flex-wrap gap-1">
                  {project.team_hats.map((h) => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── STEP 1: Review General App ────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="rounded-lg border bg-card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Step 1: Review General App</h2>
                <p className="text-sm text-muted-foreground">
                  Please review your general application below before proceeding. If anything needs updating, go to the General App to make edits.
                </p>
              </div>

              {genApp ? (
                <>
                  <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Profile Information</h3>
                    <ReadOnlyField label="Name" value={`${(userProfile?.first_name as string) ?? ""} ${(userProfile?.last_name as string) ?? ""}`.trim()} />
                    <ReadOnlyField label="Email" value={(genApp.email as string) ?? ""} />
                    <ReadOnlyField label="Country" value={(userProfile?.country as string) ?? ""} />
                    <ReadOnlyField label="Timezone" value={(userProfile?.timezone as string) ?? ""} />
                    <ReadOnlyField label="LinkedIn" value={(genApp.linkedin_url as string) ?? ""} />
                    <ReadOnlyField label="Portfolio" value={(genApp.portfolio_url as string) ?? ""} />
                    <ReadOnlyField label="Hours Commitment" value={(genApp.hours_commitment as string) ?? ""} />
                  </div>

                  <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">About You</h3>
                    <ReadOnlyField label="Tell us about yourself" value={(genApp.about_yourself as string) ?? ""} />
                  </div>

                  <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Engagement History</h3>
                    <ReadOnlyField label="Previous engagement with Tech Fleet" value={(genApp.previous_engagement as string) ?? ""} />
                    <ReadOnlyArrayField label="Previous engagement ways" items={(genApp.previous_engagement_ways as string[]) ?? []} />
                    <ReadOnlyField label="What have you learned from teammates?" value={(genApp.teammate_learnings as string) ?? ""} />
                  </div>

                  <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Agile Mindset</h3>
                    <ReadOnlyField label="Agile vs Waterfall" value={(genApp.agile_vs_waterfall as string) ?? ""} />
                    <ReadOnlyField label="Psychological Safety" value={(genApp.psychological_safety as string) ?? ""} />
                    <ReadOnlyField label="Agile Philosophies" value={(genApp.agile_philosophies as string) ?? ""} />
                    <ReadOnlyField label="Collaboration Challenges" value={(genApp.collaboration_challenges as string) ?? ""} />
                  </div>

                  <div className="rounded-lg border bg-card p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Service Leadership</h3>
                    <ReadOnlyField label="Servant Leadership Definition" value={(genApp.servant_leadership_definition as string) ?? ""} />
                    <ReadOnlyField label="Servant Leadership Actions" value={(genApp.servant_leadership_actions as string) ?? ""} />
                    <ReadOnlyField label="Servant Leadership Challenges" value={(genApp.servant_leadership_challenges as string) ?? ""} />
                    <ReadOnlyField label="Servant Leadership Situation" value={(genApp.servant_leadership_situation as string) ?? ""} />
                  </div>
                </>
              ) : (
                <div className="rounded-lg border bg-card p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">No general application found. Please complete it first.</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Project Questions ─────────────────── */}
          {step === 2 && (
            <div className="rounded-lg border bg-card p-6 space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Step 2: Project Questions</h2>

              <div className="space-y-1.5">
                <Label>Select all of the team hats you want to contribute to on the project <span className="text-destructive">*</span></Label>
                <MultiSelect
                  options={availableHats}
                  selected={teamHatsInterest}
                  onChange={setTeamHatsInterest}
                  placeholder="Select team hats..."
                />
                {errors.team_hats_interest && <p className="text-xs text-destructive">{errors.team_hats_interest}</p>}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-foreground font-semibold">
                  Did you participate in a previous phase of this project? <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={participatedPrev ? "yes" : "no"}
                  onValueChange={(v) => setParticipatedPrev(v === "yes")}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="prev-phase-no" />
                    <Label htmlFor="prev-phase-no" className="text-foreground font-medium cursor-pointer">No</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="prev-phase-yes" />
                    <Label htmlFor="prev-phase-yes" className="text-foreground font-medium cursor-pointer">Yes</Label>
                  </div>
                </RadioGroup>
              </div>

              {participatedPrev ? (
                <div className="space-y-4 pl-1 border-l-2 border-primary/20 ml-2 pl-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="prev-position">What team position did you join in the previous phase? <span className="text-destructive">*</span></Label>
                    <Textarea id="prev-position" value={prevPosition} onChange={(e) => setPrevPosition(e.target.value)} rows={2} />
                    {errors.previous_phase_position && <p className="text-xs text-destructive">{errors.previous_phase_position}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prev-learnings">What did you learn in the previous phase? <span className="text-destructive">*</span></Label>
                    <Textarea id="prev-learnings" value={prevLearnings} onChange={(e) => setPrevLearnings(e.target.value)} rows={3} />
                    {errors.previous_phase_learnings && <p className="text-xs text-destructive">{errors.previous_phase_learnings}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prev-help">How will you help your teammates succeed in this upcoming phase? <span className="text-destructive">*</span></Label>
                    <Textarea id="prev-help" value={prevHelpTeammates} onChange={(e) => setPrevHelpTeammates(e.target.value)} rows={3} />
                    {errors.previous_phase_help_teammates && <p className="text-xs text-destructive">{errors.previous_phase_help_teammates}</p>}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="prior-prep">
                    How has your prior engagement (either in projects, in classes, or observing) in Tech Fleet community prepared you for this team role? <span className="text-destructive">*</span>
                  </Label>
                  <Textarea id="prior-prep" value={priorPreparation} onChange={(e) => setPriorPreparation(e.target.value)} rows={4} />
                  {errors.prior_engagement_preparation && <p className="text-xs text-destructive">{errors.prior_engagement_preparation}</p>}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Client Questions ──────────────────── */}
          {step === 3 && (
            <div className="rounded-lg border bg-card p-6 space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Step 3: Client Questions</h2>

              <div className="space-y-1.5">
                <Label htmlFor="passion">Why are you passionate about being on this project? <span className="text-destructive">*</span></Label>
                <Textarea id="passion" value={passion} onChange={(e) => setPassion(e.target.value)} rows={4} />
                {errors.passion_for_project && <p className="text-xs text-destructive">{errors.passion_for_project}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="client-knowledge">
                  What do you know about the client and the project that you're applying to? Tell us about it. <span className="text-destructive">*</span>
                </Label>
                <Textarea id="client-knowledge" value={clientKnowledge} onChange={(e) => setClientKnowledge(e.target.value)} rows={4} />
                {errors.client_project_knowledge && <p className="text-xs text-destructive">{errors.client_project_knowledge}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cross-functional">
                  How would you like to contribute to cross-functional teamwork on the team? <span className="text-destructive">*</span>
                </Label>
                <Textarea id="cross-functional" value={crossFunctional} onChange={(e) => setCrossFunctional(e.target.value)} rows={4} />
                {errors.cross_functional_contribution && <p className="text-xs text-destructive">{errors.cross_functional_contribution}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="success-contribution">
                  How will you contribute to this project's successful outcomes as an apprentice or a co-lead and as a teammate? <span className="text-destructive">*</span>
                </Label>
                <Textarea id="success-contribution" value={successContribution} onChange={(e) => setSuccessContribution(e.target.value)} rows={4} />
                {errors.project_success_contribution && <p className="text-xs text-destructive">{errors.project_success_contribution}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky Footer Actions ─────────────────────────── */}
      <div className="shrink-0 border-t bg-background px-4 sm:px-6 py-3">
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-3">
          {/* Left side */}
          <div className="flex items-center gap-2">
            {step === 1 && (
              <Button onClick={() => navigate("/applications/general")} disabled={isSaving}>
                Go to General Application
              </Button>
            )}
            {step > 1 && (
              <Button onClick={handleBack} disabled={isSaving}>
                Back
              </Button>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Save Draft — always available on steps 2 & 3 when not completed */}
            {!isCompleted && step > 1 && (
              <Button variant="secondary" onClick={handleSaveDraft} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Draft
              </Button>
            )}

            {/* Save Changes for completed apps */}
            {isCompleted && (
              <Button variant="secondary" onClick={handleSaveCompleted} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Changes
              </Button>
            )}

            {/* Step 1: Continue */}
            {step === 1 && (
              <Button onClick={handleNext} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Continue
              </Button>
            )}

            {/* Step 2: Next */}
            {step === 2 && !isCompleted && (
              <Button onClick={handleNext} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Next
              </Button>
            )}

            {/* Step 3: Submit — blue only when all fields entered */}
            {step === 3 && !isCompleted && (
              <Button
                onClick={handleSubmit}
                disabled={isSaving || !isSubmitReady}
                variant={isSubmitReady ? "default" : "outline"}
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Celebration dialog ────────────────────────────── */}
      <Dialog open={celebrationOpen} onOpenChange={setCelebrationOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl">
              <PartyPopper className="h-6 w-6 text-warning" />
              Application Submitted!
            </DialogTitle>
            <DialogDescription>
              Your application for {client?.name} has been submitted successfully. The team will review it and get back to you.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center sm:justify-center pt-2">
            <Button onClick={() => { setCelebrationOpen(false); navigate("/project-openings"); }}>
              Back to Openings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
