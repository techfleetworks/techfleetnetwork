import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { z } from "zod";
import {
  Building2, Plus, Pencil, Trash2, Loader2,
  LayoutGrid, List, Globe, User, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(200),
  website: z.string().trim().min(1, "Website is required").max(500).url("Must be a valid URL"),
  mission: z.string().trim().min(1, "Mission is required").max(2000),
  project_summary: z.string().trim().min(1, "Project summary is required").max(5000),
  status: z.enum(["active", "inactive"]),
  primary_contact: z.string().trim().min(1, "Primary contact is required").max(200),
});

type ClientForm = z.infer<typeof clientSchema>;

export interface Client extends ClientForm {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM: ClientForm = {
  name: "", website: "", mission: "", project_summary: "", status: "active", primary_contact: "",
};

export function ClientsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"table" | "card">("card");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ClientForm, string>>>({});

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Client[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: ClientForm) => {
      const { error } = await supabase.from("clients").insert({ ...values, created_by: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); toast.success("Client created"); closeDialog(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ClientForm }) => {
      const { error } = await supabase.from("clients").update(values as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); toast.success("Client updated"); closeDialog(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clients"] }); toast.success("Client deleted"); setDeleteTarget(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeDialog = useCallback(() => { setDialogOpen(false); setEditingClient(null); setForm(EMPTY_FORM); setErrors({}); }, []);
  const openCreate = useCallback(() => { setEditingClient(null); setForm(EMPTY_FORM); setErrors({}); setDialogOpen(true); }, []);
  const openEdit = useCallback((client: Client) => {
    setEditingClient(client);
    setForm({ name: client.name, website: client.website, mission: client.mission, project_summary: client.project_summary, status: client.status, primary_contact: client.primary_contact });
    setErrors({}); setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(() => {
    const result = clientSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ClientForm, string>> = {};
      result.error.issues.forEach((i) => { const k = i.path[0] as keyof ClientForm; if (!fieldErrors[k]) fieldErrors[k] = i.message; });
      setErrors(fieldErrors); return;
    }
    setErrors({});
    editingClient ? updateMutation.mutate({ id: editingClient.id, values: result.data }) : createMutation.mutate(result.data);
  }, [form, editingClient, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const statusBadge = (status: string) =>
    status === "active" ? <Badge className="bg-success/10 text-success border-success/20">Active</Badge> : <Badge variant="secondary">Inactive</Badge>;

  const columnDefs = useMemo<ColDef<Client>[]>(() => [
    { headerName: "Name", field: "name", flex: 2, minWidth: 140 },
    {
      headerName: "Website", field: "website", flex: 2, minWidth: 140,
      valueGetter: (params) => {
        try { return new URL(params.data?.website ?? "").hostname; } catch { return params.data?.website ?? ""; }
      },
    },
    { headerName: "Primary Contact", field: "primary_contact", flex: 1, minWidth: 120 },
    {
      headerName: "Status", field: "status", flex: 1, minWidth: 90,
      valueFormatter: (params) => params.value === "active" ? "Active" : "Inactive",
    },
    {
      headerName: "Mission", field: "mission", flex: 2, minWidth: 140, hide: true,
      valueFormatter: (params) => {
        const v = params.value ?? "";
        return v.length > 80 ? v.slice(0, 80) + "…" : v;
      },
    },
    {
      headerName: "Project Summary", field: "project_summary", flex: 2, minWidth: 140, hide: true,
      valueFormatter: (params) => {
        const v = params.value ?? "";
        return v.length > 80 ? v.slice(0, 80) + "…" : v;
      },
    },
    {
      headerName: "Updated", field: "updated_at", flex: 1, minWidth: 110,
      valueFormatter: (params) => params.value ? format(new Date(params.value), "MMM d, yyyy") : "—",
    },
    {
      headerName: "Actions",
      colId: "actions",
      sortable: false,
      filter: false,
      resizable: false,
      flex: 1,
      minWidth: 100,
      maxWidth: 120,
      cellRenderer: (params: ICellRendererParams<Client>) => {
        if (!params.data) return null;
        const c = params.data;
        return `<div style="display:flex;gap:4px;align-items:center;height:100%">
          <button data-action="edit" data-id="${c.id}" style="padding:4px;cursor:pointer;background:none;border:none" aria-label="Edit ${c.name}">✏️</button>
          <button data-action="delete" data-id="${c.id}" style="padding:4px;cursor:pointer;background:none;border:none;color:hsl(var(--destructive))" aria-label="Delete ${c.name}">🗑️</button>
        </div>`;
      },
    },
  ], []);

  const onCellClicked = useCallback((params: any) => {
    if (params.colDef.colId !== "actions") return;
    const target = params.event?.target as HTMLElement;
    const action = target?.closest("[data-action]")?.getAttribute("data-action");
    const id = target?.closest("[data-id]")?.getAttribute("data-id");
    if (!action || !id) return;
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    if (action === "edit") openEdit(client);
    if (action === "delete") setDeleteTarget(client);
  }, [clients, openEdit]);

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-muted-foreground">Manage nonprofit client records.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <Button variant={view === "card" ? "default" : "ghost"} size="sm" onClick={() => setView("card")} aria-label="Card view"><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={view === "table" ? "default" : "ghost"} size="sm" onClick={() => setView("table")} aria-label="Table view"><List className="h-4 w-4" /></Button>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Client</Button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No clients yet</p>
          <p className="text-sm mt-1">Click "Add Client" to create your first record.</p>
        </div>
      ) : view === "table" ? (
        <ThemedAgGrid<Client>
          gridId="admin-clients"
          height="450px"
          rowData={clients}
          columnDefs={columnDefs}
          getRowId={(params) => params.data.id}
          onCellClicked={onCellClicked}
          pagination
          paginationPageSize={20}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg leading-tight">{c.name}</CardTitle>
                  {statusBadge(c.status)}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><Globe className="h-4 w-4 shrink-0" /><a href={c.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{new URL(c.website).hostname}</a></div>
                <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4 shrink-0" /><span className="truncate">{c.primary_contact}</span></div>
                <div><p className="text-xs font-medium text-muted-foreground mb-1">Mission</p><p className="text-foreground line-clamp-3">{c.mission}</p></div>
                <div><p className="text-xs font-medium text-muted-foreground mb-1">Project Summary</p><p className="text-foreground line-clamp-3">{c.project_summary}</p></div>
              </CardContent>
              <CardFooter className="pt-3 border-t flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Updated {format(new Date(c.updated_at), "MMM d, yyyy")}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)} aria-label={`Delete ${c.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit Client" : "Add Client"}</DialogTitle>
            <DialogDescription>{editingClient ? "Update the client record below." : "Fill out the form to create a new client."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Client Name <span className="text-destructive">*</span></Label>
              <Input id="client-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={200} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-website">Website <span className="text-destructive">*</span></Label>
              <Input id="client-website" type="url" placeholder="https://example.org" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} maxLength={500} aria-invalid={!!errors.website} />
              {errors.website && <p className="text-xs text-destructive">{errors.website}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-contact">Primary Contact <span className="text-destructive">*</span></Label>
              <Input id="client-contact" value={form.primary_contact} onChange={(e) => setForm((f) => ({ ...f, primary_contact: e.target.value }))} maxLength={200} aria-invalid={!!errors.primary_contact} />
              {errors.primary_contact && <p className="text-xs text-destructive">{errors.primary_contact}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-status">Status <span className="text-destructive">*</span></Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "active" | "inactive" }))}>
                <SelectTrigger id="client-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-mission">Mission <span className="text-destructive">*</span></Label>
              <Textarea id="client-mission" rows={3} value={form.mission} onChange={(e) => setForm((f) => ({ ...f, mission: e.target.value }))} maxLength={2000} aria-invalid={!!errors.mission} />
              {errors.mission && <p className="text-xs text-destructive">{errors.mission}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-summary">Project Summary <span className="text-destructive">*</span></Label>
              <Textarea id="client-summary" rows={4} value={form.project_summary} onChange={(e) => setForm((f) => ({ ...f, project_summary: e.target.value }))} maxLength={5000} aria-invalid={!!errors.project_summary} />
              {errors.project_summary && <p className="text-xs text-destructive">{errors.project_summary}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingClient ? "Save Changes" : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The client record will be permanently removed.</AlertDialogDescription>
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
