import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { z } from "zod";
import {
  Plus, Pencil, Trash2, Loader2, FolderKanban,
  LayoutGrid, List, ExternalLink, Globe, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
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

interface Project extends ProjectForm {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM: ProjectForm = {
  client_id: "",
  project_type: "website_design",
  phase: "phase_1",
  team_hats: [],
  project_status: "coming_soon",
  current_phase_milestones: [],
};

// ---------- Component ----------
export function ProjectsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"table" | "card">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectForm, string>>>({});

  // Fetch active clients for select
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

  // Fetch projects
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Project[];
    },
  });

  // Milestone reference
  const { data: milestoneRefs = [] } = useMilestoneReference();

  const computed = useMemo(
    () => computeMilestoneData(form.current_phase_milestones, milestoneRefs),
    [form.current_phase_milestones, milestoneRefs]
  );

  // Selected client info for read-only display in form
  const selectedClient = useMemo(() => clientMap.get(form.client_id), [form.client_id, clientMap]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (values: ProjectForm) => {
      const { error } = await supabase.from("projects").insert({ ...values, created_by: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project created"); closeDialog(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProjectForm }) => {
      const { error } = await supabase.from("projects").update(values as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project updated"); closeDialog(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project deleted"); setDeleteTarget(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeDialog = useCallback(() => { setDialogOpen(false); setEditingProject(null); setForm(EMPTY_FORM); setErrors({}); }, []);
  const openCreate = useCallback(() => { setEditingProject(null); setForm(EMPTY_FORM); setErrors({}); setDialogOpen(true); }, []);
  const openEdit = useCallback((project: Project) => {
    setEditingProject(project);
    setForm({
      client_id: project.client_id,
      project_type: project.project_type as ProjectTypeValue,
      phase: project.phase as ProjectPhaseValue,
      team_hats: project.team_hats,
      project_status: project.project_status as ProjectStatusValue,
      current_phase_milestones: project.current_phase_milestones,
    });
    setErrors({}); setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(() => {
    const result = projectSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ProjectForm, string>> = {};
      result.error.issues.forEach((i) => { const k = i.path[0] as keyof ProjectForm; if (!fieldErrors[k]) fieldErrors[k] = i.message; });
      setErrors(fieldErrors); return;
    }
    setErrors({});
    editingProject ? updateMutation.mutate({ id: editingProject.id, values: result.data }) : createMutation.mutate(result.data);
  }, [form, editingProject, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
  const phaseLabel = (v: string) => PROJECT_PHASES.find((p) => p.value === v)?.label ?? v;
  const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case "project_complete": return "bg-success/10 text-success border-success/20";
      case "project_in_progress": return "bg-primary/10 text-primary border-primary/20";
      case "apply_now": case "recruiting": return "bg-warning/10 text-warning border-warning/20";
      default: return "";
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-muted-foreground">Manage projects across clients.</p>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <Button variant={view === "table" ? "default" : "ghost"} size="sm" onClick={() => setView("table")} aria-label="Table view"><List className="h-4 w-4" /></Button>
            <Button variant={view === "card" ? "default" : "ghost"} size="sm" onClick={() => setView("card")} aria-label="Card view"><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Project</Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm mt-1">Click "Add Project" to create your first project.</p>
        </div>
      ) : view === "table" ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Team Hats</TableHead>
                <TableHead className="w-[80px]">Updated</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{clientMap.get(p.client_id)?.name ?? "Unknown"}</TableCell>
                  <TableCell className="text-sm">{typeLabel(p.project_type)}</TableCell>
                  <TableCell className="text-sm">{phaseLabel(p.phase)}</TableCell>
                  <TableCell><Badge className={statusBadgeColor(p.project_status)}>{statusLabel(p.project_status)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">{p.team_hats.slice(0, 3).map((h) => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}{p.team_hats.length > 3 && <Badge variant="outline" className="text-xs">+{p.team_hats.length - 3}</Badge>}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(p.updated_at), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit project"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} aria-label="Delete project"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const client = clientMap.get(p.client_id);
            const projComputed = computeMilestoneData(p.current_phase_milestones, milestoneRefs);
            return (
              <Card key={p.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg leading-tight">{client?.name ?? "Unknown"}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">{typeLabel(p.project_type)} · {phaseLabel(p.phase)}</p>
                    </div>
                    <Badge className={statusBadgeColor(p.project_status)}>{statusLabel(p.project_status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Team Hats</p>
                    <div className="flex flex-wrap gap-1">{p.team_hats.map((h) => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}</div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Milestones</p>
                    <div className="flex flex-wrap gap-1">{p.current_phase_milestones.map((m) => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}</div>
                  </div>
                  {projComputed.deliverables.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Deliverables</p>
                      <div className="flex flex-wrap gap-1">{projComputed.deliverables.slice(0, 6).map((d) => <Badge key={d} variant="outline" className="text-xs bg-accent/50">{d}</Badge>)}{projComputed.deliverables.length > 6 && <Badge variant="outline" className="text-xs">+{projComputed.deliverables.length - 6}</Badge>}</div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-3 border-t flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Updated {format(new Date(p.updated_at), "MMM d, yyyy")}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit project"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} aria-label="Delete project"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "Add Project"}</DialogTitle>
            <DialogDescription>{editingProject ? "Update the project details." : "Fill out the form to create a new project."}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client <span className="text-destructive">*</span></Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                <SelectTrigger aria-invalid={!!errors.client_id}><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {activeClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.client_id && <p className="text-xs text-destructive">{errors.client_id}</p>}
            </div>

            {/* Read-only client info */}
            {selectedClient && (
              <div className="rounded-md border p-3 bg-muted/30 space-y-2">
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
              <Label>Project Type <span className="text-destructive">*</span></Label>
              <Select value={form.project_type} onValueChange={(v) => setForm((f) => ({ ...f, project_type: v as ProjectTypeValue }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROJECT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Phase */}
            <div className="space-y-1.5">
              <Label>Phase <span className="text-destructive">*</span></Label>
              <Select value={form.phase} onValueChange={(v) => setForm((f) => ({ ...f, phase: v as ProjectPhaseValue }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Label>Project Status <span className="text-destructive">*</span></Label>
              <Select value={form.project_status} onValueChange={(v) => setForm((f) => ({ ...f, project_status: v as ProjectStatusValue }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <div className="space-y-3">
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

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingProject ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The project record will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
