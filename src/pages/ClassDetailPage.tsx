import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Plus, ArrowLeft, Send, ArchiveX, Pencil, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClassById } from "@/hooks/use-classes";
import { useCohortsByClass } from "@/hooks/use-cohorts";
import { ClassService } from "@/services/class.service";
import { CohortService } from "@/services/cohort.service";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useQueryClient } from "@/lib/react-query";

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();
  const { data: cls, isLoading } = useClassById(id);
  const { data: cohorts = [] } = useCohortsByClass(id);
  const [busy, setBusy] = useState(false);

  if (isLoading || !cls) {
    return (
      <div className="container-app py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = user?.id === cls.owner_user_id;
  const canEdit = isOwner || isAdmin;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["classes"] });

  const action = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-app py-8 sm:py-12 space-y-6 max-w-4xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/teach/classes"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>

      {cls.hero_image_url && (
        <img
          src={cls.hero_image_url}
          alt={`${cls.title} hero`}
          className="w-full max-h-72 object-cover rounded-md border border-border"
          loading="lazy"
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2">{cls.status.replace("_", " ")}</Badge>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{cls.title}</h1>
          {cls.summary && (
            <div
              className="prose prose-invert max-w-none text-sm text-muted-foreground mt-1"
              dangerouslySetInnerHTML={{ __html: cls.summary }}
            />
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/teach/classes/${cls.id}/edit`}><Pencil className="h-4 w-4 mr-1" />Edit</Link>
            </Button>
            {cls.status === "draft" && isOwner && (
              <Button size="sm" disabled={busy} onClick={() => action("Submitted for review", () => ClassService.submitForReview(cls.id))}>
                <Send className="h-4 w-4 mr-1" />Submit for review
              </Button>
            )}
            {cls.status === "pending_review" && isAdmin && (
              <Button size="sm" disabled={busy} onClick={() => action("Class published", () => ClassService.approveAndPublish(cls.id))}>
                Approve & publish
              </Button>
            )}
            {cls.status !== "archived" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => action("Class archived", () => ClassService.archive(cls.id))}>
                <ArchiveX className="h-4 w-4 mr-1" />Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {cls.description && (
        <section>
          <h2 className="font-semibold text-base mb-2">About this class</h2>
          <div className="prose prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: cls.description }} />
        </section>
      )}

      {cls.why_take && (
        <section>
          <h2 className="font-semibold text-base mb-2">Why take this course?</h2>
          <div className="prose prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: cls.why_take }} />
        </section>
      )}

      {cls.outcomes && (
        <section>
          <h2 className="font-semibold text-base mb-2">Outcomes</h2>
          <div className="prose prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: cls.outcomes }} />
        </section>
      )}

      {cls.audiences && (
        <section>
          <h2 className="font-semibold text-base mb-2">Audiences</h2>
          <div className="prose prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: cls.audiences }} />
        </section>
      )}

      {cls.skills.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">Skills</h3>
          <div className="flex flex-wrap gap-1.5">
            {cls.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
          </div>
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Cohorts</h2>
          {canEdit && (
            <Button asChild size="sm">
              <Link to={`/teach/classes/${cls.id}/cohorts/new`}><Plus className="h-4 w-4 mr-1" />New cohort</Link>
            </Button>
          )}
        </div>
        {cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohorts yet.</p>
        ) : (
          <div className="space-y-2">
            {cohorts.map((c) => (
              <div key={c.id} className="card-elevated p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(c.start_date), "MMM d")} – {format(new Date(c.end_date), "MMM d, yyyy")} · {c.timezone}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{c.status}</Badge>
                  {c.status === "published" && c.registration_url && (
                    <Button
                      asChild
                      size="sm"
                      onClick={() => CohortService.recordRegistrationClick(c.id).catch(() => undefined)}
                    >
                      <a href={c.registration_url} target="_blank" rel="noopener noreferrer">
                        Register <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  )}
                  {canEdit && c.status === "draft" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => action("Cohort submitted", () => CohortService.submitForReview(c.id))}>
                      Submit
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
