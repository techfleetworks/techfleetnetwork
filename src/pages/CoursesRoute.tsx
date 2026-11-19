// /courses serves ONE URL to everyone (owner decision, 2026-11-18): a signed-in
// member gets the progress-rich TrainingPage; an anonymous visitor gets the
// public catalog (PublicCoursesPage). Branching HERE — not inside either page —
// keeps the member page untouched and the public page free of auth coupling, and
// keeps the two in separate lazy chunks. See ADR 20261118-public-classes-pages.
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

const TrainingPage = lazyWithRetry(() => import("./TrainingPage"));
const PublicCoursesPage = lazyWithRetry(() => import("./PublicCoursesPage"));

export default function CoursesRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="container-app flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  return user ? <TrainingPage /> : <PublicCoursesPage />;
}
