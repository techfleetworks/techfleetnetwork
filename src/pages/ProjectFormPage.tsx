import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import { z } from "zod";
import {
  Loader2, ArrowLeft, Globe, User, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  PROJECT_TYPES, PROJECT_PHASES, PROJECT_STATUSES, TEAM_HATS, MILESTONE_OPTIONS,
  type ProjectTypeValue, type ProjectPhaseValue, type ProjectStatusValue,
} from "@/data/project-constants";
import { useMilestoneReference, computeMilestoneData } from "@/hooks/use-milestone-reference";
import type { Client } from "@/components/clients/ClientsTab";

// ---------- Schema ----------
const projectSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  project_type: z.enum(["website_design", "service_design", "application_design", "strategy", "discovery"] as const),
  phase: z.enum(["phase_1", "phase_2", "phase_3", "phase_4"] as const),
  team_hats: z.array(z.string()).min(1, "Select at least one team hat"),
  project_status: z.enum(["coming_soon", "apply_now", "recruiting", "team_onboarding", "project_in_progress", "project_complete"] as const),
  current_phase_milestones: z.array(z.string()).min(1, "Select at least one milestone"),
});

type ProjectForm = z.infer<typeof projectSchema>;

const EMPTY_FORM: ProjectForm = {
  client_id: "",
  project_type: "website_design",
  phase: "phase_1",
  team_hats: [],
  project_status: "coming_soon",
  current_phase_milestones: [],
};

export default function ProjectFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectForm, string>>>({});
  const [initialized, setInitialized] = useState(!isEditing);

  // Fetch existing project when editing
  const { isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEditing,
    meta: {
      onSettled: (data: any) => {
        if (data && !initialized) {
          setForm({
            client_id: data.client_id,
            project_type: data.project_type as ProjectTypeValue,
            phase: data.phase as ProjectPhaseValue,
            team_hats: data.team_hats ?? [],
            project_status: data.project_status as ProjectStatusValue,
            current_phase_milestones: data.current_phase_milestones ?? [],
          });
          setInitialized(true);
        }
      },
    },
  });

  // Workaround: useQuery doesn't support meta.onSettled in all versions, so use effect-like pattern
  const { data: existingProject } = useQuery({
    queryKey: ["project-init", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEditing && !initialized,
  });

  // Initialize form from fetched project
  if (existingProject && !initialized) {
    setForm({
      client_id: existingProject.client_id,
      project_type: existingProject.project_type as ProjectTypeValue,
      phase: existingProject.phase as ProjectPhaseValue,
      team_hats: existingProject.team_hats ?? [],
      project_status: existingProject.project_status as ProjectStatusValue,
      current_phase_milestones: existingProject.current_phase_milestones ?? [],
    });
    setInitialized(true);
  }

  // Fetch active clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Client[];
    },
  });

  const activeClients = useMemo(() => clients.filter((c) => c.status === "active"), [clients]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const selectedClient = useMemo(() => clientMap.get(form.client_id), [form.client_id, clientMap]);

  // Milestone reference
  const { data: milestoneRefs = [] } = useMilestoneReference();
  const computed = useMemo(
    () => computeMilestoneData(form.current_phase_milestones, milestoneRefs),
    [form.current_phase_milestones, milestoneRefs],
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (values: ProjectForm) => {
      const { error } = await supabase.from("projects").insert({ ...values, created_by: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
      navigate("/admin/clients?tab=projects");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: ProjectForm) => {
      const { error } = await supabase.from("projects").update(values as any).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated");
      navigate("/admin/clients?tab=projects");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = useCallback(() => {
    const result = projectSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ProjectForm, string>> = {};
      result.error.issues.forEach((i) => {
        const k = i.path[0] as keyof ProjectForm;
        if (!fieldErrors[k]) fieldErrors[k] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    isEditing ? updateMutation.mutate(result.data) : createMutation.mutate(result.data);
  }, [form, isEditing, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (adminLoading || (isEditing && !initialized)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/clients">Clients &amp; Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{isEditing ? "Edit Project" : "Create Project"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/clients?tab=projects")} aria-label="Back to projects">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {isEditing ? "Edit Project" : "Create Project"}
        </h1>
      </div>

      {/* Form */}
      <div className="rounded-lg border bg-card p-6 space-y-5">
        {/* Client */}
        <div className="space-y-1.5">
          <Label htmlFor="client-select">Client <span className="text-destructive">*</span></Label>
          <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
            <SelectTrigger id="client-select" aria-invalid={!!errors.client_id}><SelectValue placeholder="Select a client" /></SelectTrigger>
            <SelectContent>
              {activeClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.client_id && <p className="text-xs text-destructive">{errors.client_id}</p>}
        </div>

        {/* Read-only client info */}
        {selectedClient && (
          <div className="rounded-md border p-4 bg-muted/30 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <a href={selectedClient.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                  {(() => { try { return new URL(selectedClient.website).hostname; } catch { return selectedClient.website; } })()}
                  <ExternalLink className="h-3 w-3 inline ml-1" />
                </a>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selectedClient.primary_contact}</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Mission</p>
              <p className="text-sm text-foreground mt-0.5">{selectedClient.mission}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Project Summary</p>
              <p className="text-sm text-foreground mt-0.5">{selectedClient.project_summary}</p>
            </div>
          </div>
        )}

        {/* Project Type */}
        <div className="space-y-1.5">
          <Label htmlFor="project-type">Project Type <span className="text-destructive">*</span></Label>
          <Select value={form.project_type} onValueChange={(v) => setForm((f) => ({ ...f, project_type: v as ProjectTypeValue }))}>
            <SelectTrigger id="project-type"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Phase */}
        <div className="space-y-1.5">
          <Label htmlFor="phase">Phase <span className="text-destructive">*</span></Label>
          <Select value={form.phase} onValueChange={(v) => setForm((f) => ({ ...f, phase: v as ProjectPhaseValue }))}>
            <SelectTrigger id="phase"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Team Hats */}
        <div className="space-y-1.5">
          <Label>Team Hats <span className="text-destructive">*</span></Label>
          <MultiSelect
            options={TEAM_HATS.map((h) => ({ label: h, value: h }))}
            selected={form.team_hats}
            onChange={(v) => setForm((f) => ({ ...f, team_hats: v }))}
            placeholder="Select team hats..."
          />
          {errors.team_hats && <p className="text-xs text-destructive">{errors.team_hats}</p>}
        </div>

        {/* Project Status */}
        <div className="space-y-1.5">
          <Label htmlFor="project-status">Project Status <span className="text-destructive">*</span></Label>
          <Select value={form.project_status} onValueChange={(v) => setForm((f) => ({ ...f, project_status: v as ProjectStatusValue }))}>
            <SelectTrigger id="project-status"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Current Phase Milestones */}
        <div className="space-y-1.5">
          <Label>Current Phase Milestones <span className="text-destructive">*</span></Label>
          <MultiSelect
            options={MILESTONE_OPTIONS.map((m) => ({ label: m, value: m }))}
            selected={form.current_phase_milestones}
            onChange={(v) => setForm((f) => ({ ...f, current_phase_milestones: v }))}
            placeholder="Select milestones..."
          />
          {errors.current_phase_milestones && <p className="text-xs text-destructive">{errors.current_phase_milestones}</p>}
        </div>

        {/* Computed read-only fields */}
        {form.current_phase_milestones.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Computed from Selected Milestones</p>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Current Phase Deliverables</Label>
                <div className="flex flex-wrap gap-1.5">
                  {computed.deliverables.length > 0
                    ? computed.deliverables.map((d) => <Badge key={d} variant="outline" className="text-xs bg-accent/50">{d}</Badge>)
                    : <span className="text-xs text-muted-foreground italic">No deliverables found</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Expected Activities</Label>
                <div className="flex flex-wrap gap-1.5">
                  {computed.activities.length > 0
                    ? computed.activities.map((a) => <Badge key={a} variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">{a}</Badge>)
                    : <span className="text-xs text-muted-foreground italic">No activities found</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Expected Skillsets for Teammates</Label>
                <div className="flex flex-wrap gap-1.5">
                  {computed.skills.length > 0
                    ? computed.skills.map((s) => <Badge key={s} variant="outline" className="text-xs bg-secondary text-secondary-foreground">{s}</Badge>)
                    : <span className="text-xs text-muted-foreground italic">No skills found</span>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => navigate("/admin/clients?tab=projects")} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </div>
  );
}
