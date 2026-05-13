import * as React from "react";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tech Fleet Brand Guide §6.5 — Modal & confirmation dialog standard.
 *
 *  Title  = the action being decided ("Delete project?")
 *  Body   = the consequence ("This will permanently remove all files.")
 *  Action = verb+object that matches the title; never "OK" or "Yes"
 *
 * Use this wrapper instead of building custom AlertDialog markup so future
 * dialogs stay on-voice automatically.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Action-named question, e.g. "Delete project?" */
  title: string;
  /** Plain-language description of what will happen. */
  consequence: React.ReactNode;
  /** Verb+object matching the title, e.g. "Delete project". */
  actionLabel: string;
  /** Defaults to "Cancel" — override only for clarity ("Keep editing"). */
  cancelLabel?: string;
  /** Style the primary action as destructive (red). */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  actionLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{consequence}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            className={cn(
              destructive &&
                buttonVariants({ variant: "destructive" }).split(" ").join(" ")
            )}
          >
            {loading ? "Working…" : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
