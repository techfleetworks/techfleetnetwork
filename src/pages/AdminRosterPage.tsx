import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@/lib/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Loader2, CheckCircle2, AlertCircle, Users,
} from "lucide-react";
import { ThemedAgGrid } from "@/components/AgGrid";
import { format } from "date-fns";
import type { ColDef } from "ag-grid-community";
import { useAdmin } from "@/hooks/use-admin";

interface RosterEntry {
  id: string;
  airtable_record_id: string;
  member_name: string;
  member_email: string;
  member_role: string;
  project_name: string;
  client_name: string;
  phase: string;
  project_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  hours_contributed: number;
  performance_notes: string;
  mentor: string;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export default function AdminRosterPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncDetail, setSyncDetail] = useState("");

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["project-roster"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_roster")
        .select("*")
        .order("synced_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RosterEntry[];
    },
    enabled: isAdmin,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncStatus("syncing");
      setSyncDetail("");
      const { data, error } = await supabase.functions.invoke("sync-airtable-roster", {
        body: { table_name: "Project Roster" },
      });
      if (error) throw new Error(error.message);
      if (!data.success && data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setSyncStatus("done");
      setSyncDetail(`Synced ${data.synced} records (${data.upserted} upserted)`);
      toast.success(`Roster synced: ${data.synced} records`);
      queryClient.invalidateQueries({ queryKey: ["project-roster"] });
    },
    onError: (err: Error) => {
      setSyncStatus("error");
      setSyncDetail(err.message);
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const columnDefs = useMemo<ColDef<RosterEntry>[]>(() => [
    { headerName: "Member", field: "member_name", flex: 2, minWidth: 150, filter: true },
    { headerName: "Email", field: "member_email", flex: 2, minWidth: 180, filter: true },
    { headerName: "Role / Hat", field: "member_role", flex: 1.5, minWidth: 130, filter: true },
    { headerName: "Project", field: "project_name", flex: 2, minWidth: 150, filter: true },
    { headerName: "Client", field: "client_name", flex: 1.5, minWidth: 130, filter: true },
    { headerName: "Phase", field: "phase", flex: 1, minWidth: 90, filter: true },
    { headerName: "Status", field: "status", flex: 1, minWidth: 100, filter: true },
    {
      headerName: "Start",
      field: "start_date",
      flex: 1,
      minWidth: 110,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },
    {
      headerName: "End",
      field: "end_date",
      flex: 1,
      minWidth: 110,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy") : "—",
    },
    {
      headerName: "Hours",
      field: "hours_contributed",
      flex: 0.8,
      minWidth: 80,
      type: "numericColumn",
    },
    { headerName: "Mentor", field: "mentor", flex: 1.2, minWidth: 120, filter: true },
    {
      headerName: "Last Synced",
      field: "synced_at",
      flex: 1.2,
      minWidth: 140,
      valueFormatter: (p) => p.value ? format(new Date(p.value), "MMM d, yyyy HH:mm") : "—",
    },
  ], []);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container-app py-12 text-center">
        <p className="text-destructive font-medium">Access denied. Admin role required.</p>
      </div>
    );
  }

  return (
    <div className="container-app py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" aria-hidden="true" />
            Project Roster
          </h1>
          <p className="text-muted-foreground mt-1">
            Historical and ongoing team member assignments synced from Airtable.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {syncStatus === "done" && (
            <Badge variant="outline" className="gap-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
              {syncDetail}
            </Badge>
          )}
          {syncStatus === "error" && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {syncDetail.slice(0, 60)}
            </Badge>
          )}

          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                Sync from Airtable
              </>
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : roster.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-40" aria-hidden="true" />
          <p className="text-lg font-medium">No roster data yet</p>
          <p className="text-sm mt-1">Click "Sync from Airtable" to import your project roster.</p>
        </div>
      ) : (
        <ThemedAgGrid<RosterEntry>
          gridId="admin-project-roster"
          height="550px"
          rowData={roster}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          pagination
          paginationPageSize={25}
          showExportCsv
          exportFileName="project-roster"
        />
      )}
    </div>
  );
}
