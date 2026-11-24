// Shared loading / error / empty state for the public catalog pages (FR-8).
//
// Presentational only (src/components rule: render + format, no data/auth). The
// caller passes `joinHref` — the open-redirect-safe sign-in link for ITS own
// surface (e.g. loginRedirectHref("/courses") vs "/project-openings") — so a
// logged-out visitor is never dead-ended on an empty or failed catalog. Shared by
// PublicCoursesPage (B10) and PublicProjectOpeningsPage (B11) so there is one way
// to render these states, not a copy per page.
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CatalogStateProps {
  loading: boolean;
  error: boolean;
  empty: boolean;
  /** Message shown when there is nothing to list (not an error — a real empty state). */
  emptyText: string;
  /** Sign-in link (redirect-back) offered on the error and empty states. */
  joinHref: string;
  children: React.ReactNode;
}

export function CatalogState({ loading, error, empty, emptyText, joinHref, children }: CatalogStateProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border bg-card p-8">
        <h2 className="text-xl font-bold text-foreground mb-2">We could not load this right now</h2>
        <p className="text-base text-muted-foreground max-w-md mb-4">
          Something went wrong fetching the catalog. Please try again in a moment.
        </p>
        <Button asChild>
          <a href={joinHref}>Join Platform</a>
        </Button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-lg border bg-card p-8">
        <h2 className="text-xl font-bold text-foreground mb-2">Nothing here yet</h2>
        <p className="text-base text-muted-foreground max-w-md mb-4">{emptyText}</p>
        <Button asChild>
          <a href={joinHref}>Join Platform</a>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
