import { useQuery } from "@/lib/react-query";
import { ClassService } from "@/services/class.service";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  submit: "Submitted for review",
  publish: "Approved & published",
  request_changes: "Changes requested",
  archive: "Archived",
};

export function ClassAuditHistory({ classId }: { classId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["classes", "audit", classId] as const,
    queryFn: () => ClassService.listAuditHistory(classId),
  });

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  }
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>;
  }

  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {data.map((row) => (
        <li key={row.id} className="text-sm">
          <div className="font-medium text-foreground">
            {ACTION_LABEL[row.action] ?? row.action}
            {row.from_status && row.to_status && (
              <span className="text-xs text-muted-foreground ml-2">
                ({row.from_status.replace("_", " ")} → {row.to_status.replace("_", " ")})
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(row.created_at), "MMM d, yyyy h:mm a")}
          </div>
          {row.reason && (
            <div className="text-xs text-foreground mt-1 bg-muted/50 rounded p-2 whitespace-pre-wrap">
              {row.reason}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
