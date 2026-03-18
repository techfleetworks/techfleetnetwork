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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, ShieldCheck, User, Mail, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

interface UserRow {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  created_at: string;
  isAdmin: boolean;
  pendingPromotion: boolean;
}

export default function UserAdminPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [promoting, setPromoting] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UserRow | null>(null);

  const fetchData = async () => {
    try {
      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, email, first_name, last_name, display_name, created_at")
        .order("created_at", { ascending: false });
      if (profilesErr) throw profilesErr;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "admin");
      const adminIds = new Set((roles || []).map((r: { user_id: string }) => r.user_id));

      const { data: promos } = await supabase
        .from("admin_promotions")
        .select("user_id")
        .is("confirmed_at", null);
      const pendingIds = new Set((promos || []).map((p: { user_id: string }) => p.user_id));

      const rows: UserRow[] = (profiles || []).map((p) => ({
        user_id: p.user_id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        display_name: p.display_name,
        created_at: p.created_at,
        isAdmin: adminIds.has(p.user_id),
        pendingPromotion: pendingIds.has(p.user_id),
      }));
      setUsers(rows);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && !adminLoading) fetchData();
  }, [isAdmin, adminLoading]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q)
    );
  }, [users, search]);

  const handlePromote = async (targetUser: UserRow) => {
    setPromoting(targetUser.user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("promote-to-admin", {
        body: { user_id: targetUser.user_id },
      });
      if (res.error) throw new Error(res.error.message || "Failed to promote user");
      const result = res.data;
      if (result?.error) throw new Error(result.error);
      toast.success(result?.message || "Confirmation email sent");
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to promote user";
      toast.error(message);
    } finally {
      setPromoting(null);
      setConfirmUser(null);
    }
  };

  const NameCellRenderer = useCallback((params: ICellRendererParams<UserRow>) => {
    const u = params.data;
    if (!u) return null;
    const name = u.first_name || u.last_name
      ? `${u.first_name} ${u.last_name}`.trim()
      : u.display_name || "—";
    return (
      <div className="flex items-center gap-2">
        <span className={u.isAdmin ? "text-primary" : "text-muted-foreground"}>
          {u.isAdmin ? "🛡" : "👤"}
        </span>
        <span className="font-medium">{name}</span>
      </div>
    );
  }, []);

  const RoleCellRenderer = useCallback((params: ICellRendererParams<UserRow>) => {
    const u = params.data;
    if (!u) return null;
    if (u.isAdmin) return <span className="text-primary font-semibold">Admin</span>;
    if (u.pendingPromotion) return <span className="text-yellow-600 dark:text-yellow-400 font-medium">Pending</span>;
    return <span className="text-muted-foreground">Member</span>;
  }, []);

  const ActionsCellRenderer = useCallback((params: ICellRendererParams<UserRow>) => {
    const u = params.data;
    if (!u) return null;
    const isSelf = u.user_id === user?.id;
    if (isSelf) return <span className="text-muted-foreground text-xs">You</span>;
    if (u.isAdmin) return <span className="text-muted-foreground text-xs">Admin</span>;
    if (u.pendingPromotion) return <span className="text-yellow-600 dark:text-yellow-400 text-xs">Awaiting confirmation</span>;
    return <span className="text-primary text-xs cursor-pointer hover:underline">Promote</span>;
  }, [user?.id]);

  const columnDefs = useMemo<ColDef<UserRow>[]>(() => [
    {
      headerName: "Name",
      field: "first_name",
      flex: 2,
      cellRenderer: NameCellRenderer,
      valueGetter: (params) => {
        const u = params.data;
        if (!u) return "";
        return u.first_name || u.last_name
          ? `${u.first_name} ${u.last_name}`.trim()
          : u.display_name || "";
      },
    },
    {
      headerName: "Email",
      field: "email",
      flex: 2,
    },
    {
      headerName: "Joined",
      field: "created_at",
      flex: 1,
      valueFormatter: (params) =>
        params.value ? format(new Date(params.value), "MMM d, yyyy") : "—",
    },
    {
      headerName: "Role",
      field: "isAdmin",
      flex: 1,
      cellRenderer: RoleCellRenderer,
      valueGetter: (params) => {
        const u = params.data;
        if (!u) return "";
        if (u.isAdmin) return "Admin";
        if (u.pendingPromotion) return "Pending";
        return "Member";
      },
    },
    {
      headerName: "Actions",
      sortable: false,
      filter: false,
      resizable: false,
      flex: 1,
      minWidth: 100,
      maxWidth: 160,
      cellRenderer: ActionsCellRenderer,
    },
  ], [user?.id, NameCellRenderer, RoleCellRenderer, ActionsCellRenderer]);

  const onCellClicked = useCallback((params: { colDef: ColDef<UserRow>; data: UserRow | undefined }) => {
    if (params.colDef.headerName === "Actions" && params.data) {
      const u = params.data;
      const isSelf = u.user_id === user?.id;
      if (!isSelf && !u.isAdmin && !u.pendingPromotion) {
        setConfirmUser(u);
      }
    }
  }, [user?.id]);

  if (adminLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">User Admin</h1>
        <p className="text-muted-foreground mt-1">
          Manage user roles for registered Tech Fleet members.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Badge variant="secondary" className="text-xs">
          {users.length} users
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <ThemedAgGrid<UserRow>
          gridId="user-admin"
          height="500px"
          rowData={filteredUsers}
          columnDefs={columnDefs}
          onCellClicked={onCellClicked}
          getRowId={(params) => params.data.user_id}
          pagination
          paginationPageSize={25}
          domLayout="normal"
          showExportCsv
          exportFileName="users"
        />
      )}

      <AlertDialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Admin?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a confirmation email to{" "}
              <strong>{confirmUser?.email}</strong>. They must click the link in
              the email to activate their admin role. You cannot undo this action
              from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!promoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmUser && handlePromote(confirmUser)}
              disabled={!!promoting}
            >
              {promoting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Confirmation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
