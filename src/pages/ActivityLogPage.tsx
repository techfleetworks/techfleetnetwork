import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";


import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Search,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef } from "ag-grid-community";

interface AuditLogEntry {
  id: string;
  event_type: string;
  table_name: string;
  record_id: string | null;
  user_id: string | null;
  actor_email: string | null;
  changed_fields: string[] | null;
  error_message: string | null;
  created_at: string;
}

const QUERY_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), QUERY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; variant: string }> = {
  profile_created: { label: "Profile Created", variant: "default" },
  profile_updated: { label: "Profile Updated", variant: "secondary" },
  role_granted: { label: "Role Granted", variant: "default" },
  role_revoked: { label: "Role Revoked", variant: "destructive" },
  task_completed: { label: "Task Completed", variant: "default" },
  task_uncompleted: { label: "Task Uncompleted", variant: "secondary" },
  application_created: { label: "Application Created", variant: "default" },
  application_status_changed: { label: "Application Status Changed", variant: "secondary" },
  application_submitted: { label: "Application Submitted", variant: "default" },
  conversation_created: { label: "Chat Started", variant: "secondary" },
  conversation_deleted: { label: "Chat Deleted", variant: "destructive" },
  invitation_created: { label: "Invitation Sent", variant: "default" },
  invitation_used: { label: "Invitation Used", variant: "default" },
  admin_promotion_initiated: { label: "Admin Promotion", variant: "default" },
  announcement_created: { label: "Announcement Created", variant: "default" },
  announcement_deleted: { label: "Announcement Deleted", variant: "destructive" },
  client_created: { label: "Client Created", variant: "default" },
  client_updated: { label: "Client Updated", variant: "secondary" },
  client_deleted: { label: "Client Deleted", variant: "destructive" },
  client_error: { label: "Client Error", variant: "destructive" },
  authn_admin_login_success: { label: "Admin Login", variant: "default" },
  authz_role_change: { label: "Role Change", variant: "secondary" },
  session_revoked: { label: "Session Revoked", variant: "destructive" },
  project_created: { label: "Project Created", variant: "default" },
  project_updated: { label: "Project Updated", variant: "secondary" },
  project_deleted: { label: "Project Deleted", variant: "destructive" },
  project_application_created: { label: "Project App Created", variant: "default" },
  project_application_status_changed: { label: "Project App Status Changed", variant: "secondary" },
  project_application_submitted: { label: "Project App Submitted", variant: "default" },
  error: { label: "Error", variant: "destructive" },
  // Email pipeline events
  email_queued: { label: "Email Queued", variant: "secondary" },
  email_sent: { label: "Email Sent", variant: "default" },
  email_failed: { label: "Email Failed", variant: "destructive" },
  email_dlq: { label: "Email Dead-Lettered", variant: "destructive" },
  email_rate_limited: { label: "Email Rate Limited", variant: "secondary" },
  email_suppressed: { label: "Email Suppressed", variant: "secondary" },
  email_bounced: { label: "Email Bounced", variant: "destructive" },
  email_complained: { label: "Email Complained", variant: "destructive" },
  // Discord integration events
  discord_invite_generated: { label: "Discord Invite Generated", variant: "default" },
  discord_bot_error: { label: "Discord Bot Error", variant: "destructive" },
};

const PAGE_SIZE = 50;

const getFieldValue = (fields: string[] | null | undefined, key: string) => {
  const prefix = `${key}:`;
  return fields?.find((field) => field.startsWith(prefix))?.slice(prefix.length) ?? null;
};

export default function ActivityLogPage() {
  // Admin access is enforced by AdminRoute wrapper
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, { email: string; name: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchProfiles = async () => {
      const { data } = await withTimeout<{ data: Array<{ user_id: string; email: string; first_name: string; last_name: string; display_name: string }> | null }>(
        supabase.from("profiles").select("user_id, email, first_name, last_name, display_name") as unknown as PromiseLike<{ data: Array<{ user_id: string; email: string; first_name: string; last_name: string; display_name: string }> | null }>,
        "Profile lookup"
      );
    if (data) {
      const map = new Map<string, { email: string; name: string }>();
      data.forEach((p) => {
        const name = p.first_name || p.last_name
          ? `${p.first_name} ${p.last_name}`.trim()
          : p.display_name || "Unknown";
        map.set(p.user_id, { email: p.email, name });
      });
      setProfiles(map);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    setLoadError("");
    try {
      let countQuery = supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true });
      if (eventFilter !== "all") countQuery = countQuery.eq("event_type", eventFilter);
      const { count } = await withTimeout<{ count: number | null }>(countQuery as unknown as PromiseLike<{ count: number | null }>, "Activity log count");
      setTotalCount(count || 0);

      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (eventFilter !== "all") query = query.eq("event_type", eventFilter);
      const { data, error } = await withTimeout<{ data: unknown[] | null; error: Error | null }>(query as unknown as PromiseLike<{ data: unknown[] | null; error: Error | null }>, "Activity log load");
      if (error) throw error;
      setEntries((data || []) as unknown as AuditLogEntry[]);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
      setLoadError(err instanceof Error ? err.message : "Activity log could not load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, eventFilter]);

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const userInfo = e.user_id ? profiles.get(e.user_id) : null;
      const attemptedEmail = getFieldValue(e.changed_fields, "attempted_email");
      return (
        e.event_type.toLowerCase().includes(q) ||
        e.table_name.toLowerCase().includes(q) ||
        (attemptedEmail?.toLowerCase().includes(q)) ||
        (e.actor_email?.toLowerCase().includes(q)) ||
        (userInfo?.email?.toLowerCase().includes(q)) ||
        (userInfo?.name?.toLowerCase().includes(q)) ||
        (e.error_message?.toLowerCase().includes(q)) ||
        (e.changed_fields?.some((f) => f.toLowerCase().includes(q)))
      );
    });
  }, [entries, search, profiles]);

  const uniqueEventTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.event_type));
    Object.keys(EVENT_TYPE_CONFIG).forEach((t) => types.add(t));
    return Array.from(types).sort();
  }, [entries]);

  const getEventConfig = (eventType: string) =>
    EVENT_TYPE_CONFIG[eventType] || {
      label: eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      variant: "secondary",
    };

  const formatChangedFields = (fields: string[] | null, eventType: string) => {
    if (!fields || fields.length === 0) return "";
    if (eventType === "password_reset_requested" || eventType === "password_reset_failed") {
      const attemptedEmail = getFieldValue(fields, "attempted_email");
      return attemptedEmail ? `Attempted email: ${attemptedEmail}` : fields.filter((field) => !field.startsWith("email_hash:")).join(", ");
    }
    if (eventType.startsWith("email_")) {
      const [template, recipient, status] = fields;
      return [template, recipient, status].filter(Boolean).join(" · ");
    }
    if (eventType === "task_completed" || eventType === "task_uncompleted") return `${fields[0]} → ${fields[1] || ""}`;
    if (eventType === "application_status_changed" && fields.length >= 2) return `${fields[0]} → ${fields[1]}`;
    return fields.join(", ");
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const columnDefs = useMemo<ColDef<AuditLogEntry>[]>(() => [
    {
      headerName: "Date",
      field: "created_at",
      flex: 1,
      minWidth: 140,
      valueFormatter: (params) =>
        params.value ? format(new Date(params.value), "MMM d, yyyy HH:mm") : "—",
    },
    {
      headerName: "Actor Email",
      flex: 2,
      minWidth: 220,
      valueGetter: (params) => {
        const e = params.data;
        if (!e?.user_id) return getFieldValue(e?.changed_fields, "attempted_email") || "System";
        const info = profiles.get(e.user_id);
        return e.actor_email || info?.email || e.user_id;
      },
    },
    {
      headerName: "Event",
      field: "event_type",
      flex: 1,
      minWidth: 140,
      valueFormatter: (params) => getEventConfig(params.value).label,
    },
    {
      headerName: "Table",
      field: "table_name",
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: "Details",
      flex: 1,
      valueGetter: (params) => {
        const e = params.data;
        if (!e) return "";
        return formatChangedFields(e.changed_fields, e.event_type);
      },
    },
    {
      headerName: "Error",
      field: "error_message",
      flex: 1,
      minWidth: 120,
      cellStyle: (params) => params.value ? { color: "hsl(var(--destructive))" } : undefined,
      valueFormatter: (params) => params.value || "—",
    },
  ], [profiles]);

  // Admin access is enforced by AdminRoute wrapper

  return (
    <div className="container-app py-8 sm:py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
        <p className="text-muted-foreground mt-1">
          View all events and actions across the platform.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events, users, errors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search activity log"
          />
        </div>
        <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[220px]" aria-label="Filter by event type">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {uniqueEventTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {getEventConfig(t).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs whitespace-nowrap">
          {totalCount} events
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <ThemedAgGrid<AuditLogEntry>
            gridId="activity-log"
            height="500px"
            rowData={filteredEntries}
            columnDefs={columnDefs}
            getRowId={(params) => params.data.id}
            rowClassRules={{
              "bg-destructive/5": (params) => !!params.data?.error_message,
            }}
            showExportCsv
            exportFileName="activity-log"
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
