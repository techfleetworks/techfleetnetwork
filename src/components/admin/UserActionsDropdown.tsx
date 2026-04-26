import { useState } from "react";
import { MoreHorizontal, ShieldPlus, Eye, MailPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface UserRow {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  created_at: string;
  isAdmin: boolean;
  pendingPromotion: boolean;
}

interface UserActionsDropdownProps {
  user: UserRow;
  isSelf: boolean;
  onPromote: (user: UserRow) => void;
  onResendInvite: (user: UserRow) => void;
  onView: (user: UserRow) => void;
  onDelete: (user: UserRow) => void;
}

export function UserActionsDropdown({
  user,
  isSelf,
  onPromote,
  onResendInvite,
  onView,
  onDelete,
}: UserActionsDropdownProps) {
  const [open, setOpen] = useState(false);

  if (isSelf) {
    return <span className="text-muted-foreground text-xs">You</span>;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label={`Actions for ${user.email}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => { setOpen(false); onView(user); }}
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </DropdownMenuItem>

        {!user.isAdmin && !user.pendingPromotion && (
          <DropdownMenuItem
            onClick={() => { setOpen(false); onPromote(user); }}
          >
            <ShieldPlus className="h-4 w-4 mr-2" />
            Promote
          </DropdownMenuItem>
        )}

        {user.pendingPromotion && (
          <DropdownMenuItem
            onClick={() => { setOpen(false); onResendInvite(user); }}
          >
            <MailPlus className="h-4 w-4 mr-2" />
            Resend Invite
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={() => { setOpen(false); onDelete(user); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete User
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
