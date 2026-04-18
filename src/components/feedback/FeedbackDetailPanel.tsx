import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import type { Feedback } from "@/services/feedback.service";

interface FeedbackDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedback: Feedback | null;
}

export default function FeedbackDetailPanel({ open, onOpenChange, feedback }: FeedbackDetailPanelProps) {
  if (!feedback) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent resizeKey="feedback-detail" className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {feedback.system_area}
            </Badge>
          </div>
          <SheetTitle className="text-lg leading-snug break-words overflow-wrap-anywhere">
            Feedback from {feedback.user_email || "Unknown"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Feedback details
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-2 -mr-2">
          <div className="space-y-5 py-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Submitted
              </p>
              <p className="text-sm text-foreground">
                {format(new Date(feedback.created_at), "PPpp")}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </p>
              <p className="text-sm text-foreground break-words overflow-wrap-anywhere">
                {feedback.user_email}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System Area
              </p>
              <p className="text-sm text-foreground">{feedback.system_area}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Message
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">
                {feedback.message}
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
