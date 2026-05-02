import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAllClasses } from "@/hooks/use-classes";

export default function AdminClassesPage() {
  const { data: classes = [], isLoading } = useAllClasses();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return classes.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!q.trim()) return true;
      const t = q.toLowerCase();
      return c.title.toLowerCase().includes(t) || c.summary.toLowerCase().includes(t);
    });
  }, [classes, q, status]);

  return (
    <div className="container-app py-8 sm:py-12 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Classes (Admin)</h1>
        <p className="text-muted-foreground mt-1">Review submissions and manage published classes.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search classes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No classes match your filters.</div>
          ) : (
            filtered.map((c) => (
              <Link
                key={c.id}
                to={`/teach/classes/${c.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.summary}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {format(new Date(c.updated_at), "MMM d, yyyy")}
                  </span>
                  <Badge variant="outline">{c.status.replace("_", " ")}</Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
