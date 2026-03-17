import { Handshake, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function ProjectOpeningsPage() {
  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Project Openings
        </h1>
        <p className="text-muted-foreground mt-1">
          Browse current openings for client project training and volunteer teams.
        </p>
      </div>

      <Tabs defaultValue="client" className="w-full">
        <TabsList className="w-full sm:w-auto mb-6">
          <TabsTrigger value="client" className="flex-1 sm:flex-none">
            Client Project Openings
          </TabsTrigger>
          <TabsTrigger value="volunteer" className="flex-1 sm:flex-none">
            Volunteer Openings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="client">
          <div className="rounded-lg border bg-card p-8 text-center">
            <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Client Project Openings
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              View current and upcoming client project training opportunities with nonprofit organizations.
            </p>
            <a
              href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/project-training-openings"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View on Guide
              </Button>
            </a>
          </div>
        </TabsContent>

        <TabsContent value="volunteer">
          <div className="rounded-lg border bg-card p-8 text-center">
            <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Volunteer Openings
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              View current volunteer team opportunities to support Tech Fleet's mission and operations.
            </p>
            <a
              href="https://guide.techfleet.org/training-openings/current-and-upcoming-program-openings/volunteer-project-openings"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View on Guide
              </Button>
            </a>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
