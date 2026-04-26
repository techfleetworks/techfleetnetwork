import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ThemedAgGrid } from "@/components/AgGrid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { UserActionsDropdown } from "@/components/admin/UserActionsDropdown";
import { UserDetailDialog } from "@/components/admin/UserDetailDialog";
import type { UserRow } from "@/components/admin/UserActionsDropdown";

export default function UserAdminPage() {
  const { user } = useAuth();
  // Admin check is handled by AdminRoute wrapper
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [promoting, setPromoting] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UserRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<"promote" | "resend" | "delete">("promote");
  const [viewUser, setViewUser] = useState<UserRow | null>(null);

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
    fetchData();
  }, []);

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

  const handleResendInvite = async (targetUser: UserRow) => {
    setPromoting(targetUser.user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("promote-to-admin", {
        body: { user_id: targetUser.user_id },
      });
      if (res.error) throw new Error(res.error.message || "Failed to resend invite");
      const result = res.data;
      if (result?.error) throw new Error(result.error);
      toast.success("Admin invite re-sent to " + targetUser.email);
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to resend invite";
      toast.error(message);
    } finally {
      setPromoting(null);
      setConfirmUser(null);
    }
  };

  const handleDeleteUser = async (targetUser: UserRow) => {
    setPromoting(targetUser.user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("admin-purge-auth-user", {
        body: { email: targetUser.email },
      });
      if (res.error) throw new Error(res.error.message || "Failed to delete user");
      const result = res.data;
      if (result?.error) throw new Error(result.error);
      toast.success(`Deleted ${targetUser.email}`);
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
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
    if (u.pendingPromotion) return <span className="text-accent-foreground font-medium">Pending</span>;
    return <span className="text-muted-foreground">Member</span>;
  }, []);

  const ActionsCellRenderer = useCallback((params: ICellRendererParams<UserRow>) => {
    const u = params.data;
    if (!u) return null;
    const isSelf = u.user_id === user?.id;
    return (
      <UserActionsDropdown
        user={u}
        isSelf={isSelf}
        onPromote={(usr) => { setConfirmAction("promote"); setConfirmUser(usr); }}
        onResendInvite={(usr) => { setConfirmAction("resend"); setConfirmUser(usr); }}
        onView={(usr) => setViewUser(usr)}
        onDelete={(usr) => { setConfirmAction("delete"); setConfirmUser(usr); }}
      />
    );
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
      width: 80,
      minWidth: 60,
      maxWidth: 100,
      pinned: "right",
      lockPinned: true,
      suppressSizeToFit: true,
      cellRenderer: ActionsCellRenderer,
    },
  ], [user?.id, NameCellRenderer, RoleCellRenderer, ActionsCellRenderer]);

  // Admin access is enforced by AdminRoute wrapper

  const confirmTitle = confirmAction === "promote" ? "Promote to Admin?" : confirmAction === "resend" ? "Resend Admin Invite?" : "Delete User?";
  const confirmDesc = confirmAction === "promote"
    ? `This will send a confirmation email to ${confirmUser?.email}. They must click the link to activate their admin role.`
    : confirmAction === "resend"
      ? `This will re-send the admin confirmation email to ${confirmUser?.email}. A new confirmation link will be generated.`
      : `This will permanently delete ${confirmUser?.email} and remove related app data. This cannot be undone.`;
  const confirmButton = confirmAction === "promote" ? "Send Confirmation" : confirmAction === "resend" ? "Resend Invite" : "Delete User";

  return (
    <div className="container-app py-8 sm:py-12 space-y-6">
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
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!promoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmUser) return;
                if (confirmAction === "promote") handlePromote(confirmUser);
                else if (confirmAction === "resend") handleResendInvite(confirmUser);
                else handleDeleteUser(confirmUser);
              }}
              disabled={!!promoting}
            >
              {promoting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {confirmButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UserDetailDialog user={viewUser} onClose={() => setViewUser(null)} />
    </div>
  );
}
