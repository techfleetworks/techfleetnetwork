import { useEffect, useState, useMemo, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Activity,
  User,
  ShieldCheck,
  FileText,
  MessageSquare,
  CheckCircle2,
  XCircle,
  UserPlus,
  Pencil,
  Copy,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

interface AuditLogEntry {
  id: string;
  event_type: string;
  table_name: string;
  record_id: string | null;
  user_id: string | null;
  changed_fields: string[] | null;
  error_message: string | null;
  created_at: string;
  // Joined from profiles
  user_email?: string;
  user_name?: string;
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof Activity; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  profile_created: { label: "Profile Created", icon: UserPlus, variant: "default" },
  profile_updated: { label: "Profile Updated", icon: Pencil, variant: "secondary" },
  role_granted: { label: "Role Granted", icon: ShieldCheck, variant: "default" },
  role_revoked: { label: "Role Revoked", icon: XCircle, variant: "destructive" },
  task_completed: { label: "Task Completed", icon: CheckCircle2, variant: "default" },
  task_uncompleted: { label: "Task Uncompleted", icon: XCircle, variant: "secondary" },
  application_created: { label: "Application Created", icon: FileText, variant: "default" },
  application_status_changed: { label: "Application Status Changed", icon: FileText, variant: "secondary" },
  application_submitted: { label: "Application Submitted", icon: FileText, variant: "default" },
  conversation_created: { label: "Chat Started", icon: MessageSquare, variant: "secondary" },
  conversation_deleted: { label: "Chat Deleted", icon: MessageSquare, variant: "destructive" },
  invitation_created: { label: "Invitation Sent", icon: UserPlus, variant: "default" },
  invitation_used: { label: "Invitation Used", icon: CheckCircle2, variant: "default" },
  admin_promotion_initiated: { label: "Admin Promotion", icon: ShieldCheck, variant: "default" },
  announcement_created: { label: "Announcement Created", icon: Activity, variant: "default" },
  announcement_deleted: { label: "Announcement Deleted", icon: Activity, variant: "destructive" },
  client_error: { label: "Client Error", icon: AlertCircle, variant: "destructive" },
  error: { label: "Error", icon: AlertCircle, variant: "destructive" },
};

const PAGE_SIZE = 50;

export default function ActivityLogPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, { email: string; name: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, display_name");
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
    try {
      // Get count
      let countQuery = supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true });

      if (eventFilter !== "all") {
        countQuery = countQuery.eq("event_type", eventFilter);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Get page of data
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (eventFilter !== "all") {
        query = query.eq("event_type", eventFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setEntries((data || []) as unknown as AuditLogEntry[]);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && !adminLoading) {
      fetchProfiles();
    }
  }, [isAdmin, adminLoading]);

  useEffect(() => {
    if (isAdmin && !adminLoading) {
      fetchLogs();
    }
  }, [isAdmin, adminLoading, page, eventFilter]);

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const userInfo = e.user_id ? profiles.get(e.user_id) : null;
      return (
        e.event_type.toLowerCase().includes(q) ||
        e.table_name.toLowerCase().includes(q) ||
        (userInfo?.email?.toLowerCase().includes(q)) ||
        (userInfo?.name?.toLowerCase().includes(q)) ||
        (e.error_message?.toLowerCase().includes(q)) ||
        (e.changed_fields?.some((f) => f.toLowerCase().includes(q)))
      );
    });
  }, [entries, search, profiles]);

  const uniqueEventTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.event_type));
    // Also add from config
    Object.keys(EVENT_TYPE_CONFIG).forEach((t) => types.add(t));
    return Array.from(types).sort();
  }, [entries]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (adminLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const getEventConfig = (eventType: string) => {
    return EVENT_TYPE_CONFIG[eventType] || {
      label: eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: Activity,
      variant: "secondary" as const,
    };
  };

  const formatChangedFields = (fields: string[] | null, eventType: string) => {
    if (!fields || fields.length === 0) return null;

    if (eventType === "task_completed" || eventType === "task_uncompleted") {
      return `${fields[0]} → ${fields[1] || ""}`;
    }
    if (eventType === "application_status_changed" && fields.length >= 2) {
      return `${fields[0]} → ${fields[1]}`;
    }
    return fields.join(", ");
  };

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
        <p className="text-muted-foreground mt-1">
          View all events and actions across the platform.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
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
          <SelectTrigger className="w-[220px]" aria-label="Filter by event type">
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
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Date</TableHead>
                  <TableHead className="w-[180px]">User</TableHead>
                  <TableHead className="w-[200px]">Event</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[60px]">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No activity found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => {
                    const config = getEventConfig(entry.event_type);
                    const Icon = config.icon;
                    const userInfo = entry.user_id ? profiles.get(entry.user_id) : null;
                    const details = formatChangedFields(entry.changed_fields, entry.event_type);

                    return (
                      <TableRow key={entry.id} className={entry.error_message ? "bg-destructive/5" : ""}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(entry.created_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          {userInfo ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{userInfo.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{userInfo.email}</div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">System</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <Badge variant={config.variant} className="text-xs whitespace-nowrap">
                              {config.label}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{entry.table_name}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {details || "—"}
                        </TableCell>
                        <TableCell>
                          {entry.error_message ? (
                            <div className="flex items-center gap-1" title={entry.error_message}>
                              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                              <span className="text-xs text-destructive truncate max-w-[200px]">
                                {entry.error_message}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
