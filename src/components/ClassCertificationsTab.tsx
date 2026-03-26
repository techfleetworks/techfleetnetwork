import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ThemedAgGrid } from "@/components/AgGrid";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search, FileDown } from "lucide-react";
import { toast } from "sonner";
import { generateCertificatePdf } from "@/lib/generate-certificate-pdf";
import type { ColDef } from "ag-grid-community";

/** Fetch the user's profile name */
function useProfileName(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile-name", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, display_name")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      const full = [data.first_name, data.last_name].filter(Boolean).join(" ");
      return full || data.display_name || "";
    },
    enabled: !!userId,
  });
}

interface CertificationRow {
  id: string;
  airtable_record_id: string;
  synced_at: string;
  raw_data: Record<string, unknown>;
}

/** Fetch cached certifications from the DB */
function useCertifications(userId: string | undefined) {
  return useQuery({
    queryKey: ["class-certifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_certifications")
        .select("id, airtable_record_id, synced_at, raw_data")
        .order("synced_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CertificationRow[];
    },
    enabled: !!userId,
  });
}

/** Dynamically generate AG Grid column defs from raw_data keys */
function buildColumnDefs(rows: CertificationRow[], profileName: string): ColDef[] {
  const fieldSet = new Set<string>();
  for (const row of rows) {
    if (row.raw_data && typeof row.raw_data === "object") {
      Object.keys(row.raw_data).forEach((k) => fieldSet.add(k));
    }
  }

  const cols: ColDef[] = [];

  // Add certificate generation column first
  cols.push({
    headerName: "Certificate",
    field: "__certificate",
    minWidth: 160,
    maxWidth: 180,
    sortable: false,
    filter: false,
    cellRenderer: (params: { data: CertificationRow }) => {
      const raw = params.data?.raw_data;
      if (!raw) return null;

      const nameFields = [
        "Contributor Name (from Contributor Record)",
        "Contributor Name",
        "Name",
        "Full Name",
        "Member Name",
      ];
      let fullName = "";
      for (const f of nameFields) {
        const val = (raw as Record<string, unknown>)[f];
        if (val) {
          fullName = Array.isArray(val) ? val[0] : String(val);
          break;
        }
      }

      const handleClick = async () => {
        try {
          toast.info("Generating certificate…");
          await generateCertificatePdf(fullName || "Tech Fleet Member");
          toast.success("Certificate downloaded!");
        } catch (err) {
          console.error("Certificate generation error:", err);
          toast.error("Failed to generate certificate");
        }
      };

      return (
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={handleClick}
        >
          <FileDown className="h-3.5 w-3.5" />
          PDF
        </button>
      );
    },
  });

  for (const field of fieldSet) {
    cols.push({
      headerName: field,
      field: field,
      valueGetter: (params) => {
        const raw = params.data?.raw_data?.[field];
        if (raw == null) return "";
        if (Array.isArray(raw)) return raw.join(", ");
        if (typeof raw === "object") return JSON.stringify(raw);
        return String(raw);
      },
      minWidth: 140,
    });
  }

  // Add synced timestamp
  cols.push({
    headerName: "Last Synced",
    field: "synced_at",
    minWidth: 160,
    valueFormatter: (params) => {
      if (!params.value) return "";
      return new Date(params.value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  });

  return cols;
}

export function ClassCertificationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useCertifications(user?.id);
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-class-certifications");
      if (error) throw error;
      if (data?.success) {
        toast.success(`Found ${data.total_found} record(s)`, {
          description: `${data.upserted} synced to your profile.`,
        });
        queryClient.invalidateQueries({ queryKey: ["class-certifications"] });
      } else {
        toast.error("Sync failed", { description: data?.error ?? "Unknown error" });
      }
    } catch (err) {
      console.error("Certification sync error:", err);
      toast.error("Could not sync certifications", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  }, [user, queryClient]);

  const columnDefs = useMemo(() => buildColumnDefs(rows), [rows]);

  const hasRecords = rows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Class Certifications</h2>
          <p className="text-sm text-muted-foreground">
            Historical masterclass records linked to your email address.
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
          variant={hasRecords ? "outline" : "default"}
        >
          {syncing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {syncing ? "Searching…" : hasRecords ? "Refresh Records" : "Search My Records"}
        </Button>
      </div>

      {isLoading ? (
        <div className="card-elevated p-12 text-center">
          <p className="text-muted-foreground text-sm">Loading certifications…</p>
        </div>
      ) : !hasRecords ? (
        <div className="card-elevated p-12 text-center space-y-3">
          <Search className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Click <strong>"Search My Records"</strong> to look up your historical masterclass
            registrations from Airtable.
          </p>
        </div>
      ) : (
        <ThemedAgGrid
          gridId="class-certifications"
          height="500px"
          columnDefs={columnDefs}
          rowData={rows}
          showExportCsv
          exportFileName="class-certifications"
          pagination
          paginationPageSize={25}
        />
      )}
    </div>
  );
}
