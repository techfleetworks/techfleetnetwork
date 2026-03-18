import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { UserRow } from "./UserActionsDropdown";

interface UserDetailDialogProps {
  user: UserRow | null;
  onClose: () => void;
}

export function UserDetailDialog({ user, onClose }: UserDetailDialogProps) {
  if (!user) return null;

  const name =
    user.first_name || user.last_name
      ? `${user.first_name} ${user.last_name}`.trim()
      : user.display_name || "—";

  const role = user.isAdmin
    ? "Admin"
    : user.pendingPromotion
      ? "Pending Admin"
      : "Member";

  return (
    <Dialog open={!!user} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" value={name} />
          <Field label="Display Name" value={user.display_name || "—"} />
          <Field label="Email" value={user.email} />
          <Field
            label="Joined"
            value={
              user.created_at
                ? format(new Date(user.created_at), "MMMM d, yyyy")
                : "—"
            }
          />
          <div>
            <span className="text-xs font-medium text-muted-foreground block mb-1">
              Role
            </span>
            <Badge
              variant={user.isAdmin ? "default" : "secondary"}
              className="text-xs"
            >
              {role}
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground block mb-1">
        {label}
      </span>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
