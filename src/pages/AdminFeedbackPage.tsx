import { useEffect, useState, useMemo, useCallback } from "react";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { useAdmin } from "@/hooks/use-admin";
import { useQuery } from "@/lib/react-query";
import { FeedbackService, type Feedback } from "@/services/feedback.service";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, RowClickedEvent } from "ag-grid-community";
import { format } from "date-fns";
import FeedbackDetailPanel from "@/components/feedback/FeedbackDetailPanel";
import { SectionEmptyState } from "@/components/SectionEmptyState";
import { MessageSquarePlus, Loader2 } from "lucide-react";

export default function AdminFeedbackPage() {
  const { setHeader } = usePageHeader();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => { setTitle("Feedback"); }, [setTitle]);

  const { data: feedback = [], isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: () => FeedbackService.listAll(),
    enabled: isAdmin,
  });

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      headerName: "Date",
      field: "created_at",
      width: 170,
      valueFormatter: (p: any) => p.value ? format(new Date(p.value), "MMM d, yyyy h:mm a") : "",
      sort: "desc",
    },
    { headerName: "Email", field: "user_email", flex: 1, minWidth: 180 },
    { headerName: "Area", field: "system_area", width: 180 },
    {
      headerName: "Message",
      field: "message",
      flex: 2,
      minWidth: 250,
      valueFormatter: (p: any) => {
        const msg = p.value || "";
        return msg.length > 80 ? msg.slice(0, 80) + "…" : msg;
      },
    },
  ], []);

  const onRowClicked = useCallback((e: RowClickedEvent<Feedback>) => {
    if (e.data) {
      setSelected(e.data);
      setPanelOpen(true);
    }
  }, []);

  if (adminLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  if (feedback.length === 0) {
    return (
      <div className="p-6">
        <SectionEmptyState
          icon={MessageSquarePlus}
          title="No Feedback Yet"
          description="When members submit feedback, it will appear here."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="ag-theme-alpine dark:ag-theme-alpine-dark w-full" style={{ height: "calc(100vh - 200px)" }}>
        <AgGridReact<Feedback>
          rowData={feedback}
          columnDefs={columnDefs}
          onRowClicked={onRowClicked}
          rowSelection="single"
          animateRows
          domLayout="normal"
          getRowId={(params) => params.data.id}
          defaultColDef={{
            resizable: true,
            sortable: true,
            filter: true,
          }}
        />
      </div>

      <FeedbackDetailPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        feedback={selected}
      />
    </div>
  );
}
