import { ClipboardList, FolderKanban, HeartHandshake } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralApplicationTab } from "@/components/GeneralApplicationTab";

export default function ApplicationsPage() {
  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Applications
        </h1>
        <p className="text-muted-foreground mt-1">
          Apply to join project teams, volunteer teams, or submit your general
          application.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="general" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            General Application
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Project Applications
          </TabsTrigger>
          <TabsTrigger value="volunteer" className="gap-2">
            <HeartHandshake className="h-4 w-4" />
            Volunteer Applications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralApplicationTab />
        </TabsContent>

        <TabsContent value="projects">
          <div className="rounded-lg border bg-card p-8 text-center">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Project Applications
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Browse and apply to active project teams. Each project has its own
              application requirements and timeline.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="volunteer">
          <div className="rounded-lg border bg-card p-8 text-center">
            <HeartHandshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Volunteer Applications
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Apply to volunteer teams that support Tech Fleet operations,
              mentorship, and community initiatives.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
