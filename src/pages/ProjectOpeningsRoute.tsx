// /project-openings serves ONE URL to everyone (public-access B11), mirroring
// B10's CoursesRoute: a signed-in member gets the progress-rich ProjectOpeningsPage
// (applied-state, volunteer/hackathon tabs, application counts); an anonymous
// visitor gets the public catalog (PublicProjectOpeningsPage). Branching HERE — not
// inside either page — keeps the member page untouched and the public page free of
// auth coupling, and keeps the two in separate lazy chunks.
//
// The detail route /project-openings/:projectId is already public (it reads the
// public-project-detail gateway and gates "apply" behind sign-in), so only the
// listing needed opening up. See ADR 20261124-public-project-openings-page.
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

const ProjectOpeningsPage = lazyWithRetry(() => import("./ProjectOpeningsPage"));
const PublicProjectOpeningsPage = lazyWithRetry(() => import("./PublicProjectOpeningsPage"));

export default function ProjectOpeningsRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="container-app flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  return user ? <ProjectOpeningsPage /> : <PublicProjectOpeningsPage />;
}
