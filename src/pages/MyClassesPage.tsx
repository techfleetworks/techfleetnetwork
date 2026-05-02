import { Link } from "react-router-dom";
import { Plus, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMyClasses } from "@/hooks/use-classes";
import { format } from "date-fns";

const STATUS_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-warning/10 text-warning border-warning/20",
  published: "bg-success/10 text-success border-success/20",
  archived: "bg-muted text-muted-foreground",
};

export default function MyClassesPage() {
  const { data: classes = [], isLoading } = useMyClasses();

  return (
    <div className="container-app py-8 sm:py-12 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Classes</h1>
          <p className="text-muted-foreground mt-1">
            Author, publish, and manage classes and their cohorts.
          </p>
        </div>
        <Button asChild>
          <Link to="/teach/classes/new"><Plus className="h-4 w-4 mr-2" />New Class</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">You have not created any classes yet.</p>
          <Button asChild className="mt-4">
            <Link to="/teach/classes/new">Create your first class</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {classes.map((c) => (
            <Link
              key={c.id}
              to={`/teach/classes/${c.id}`}
              className="card-elevated p-5 hover:border-primary/40 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="font-semibold text-foreground">{c.title}</h2>
                <Badge variant="outline" className={STATUS_VARIANT[c.status] ?? ""}>
                  {c.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{c.summary}</p>
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>{c.track === "basic_training" ? "Basic Training" : "Advanced Training"}</span>
                <span>Updated {format(new Date(c.updated_at), "MMM d, yyyy")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
