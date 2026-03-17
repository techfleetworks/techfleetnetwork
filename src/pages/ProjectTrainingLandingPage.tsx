import { Handshake } from "lucide-react";

export default function ProjectTrainingLandingPage() {
  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Project Training
        </h1>
        <p className="text-muted-foreground mt-1">
          Hands-on training through real nonprofit projects and apprenticeship teams.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-8 text-center">
        <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Coming Soon
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Project training information, team assignments, and progress tracking will be available here.
        </p>
      </div>
    </div>
  );
}
