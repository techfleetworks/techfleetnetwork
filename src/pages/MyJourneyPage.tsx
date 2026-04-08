import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassCertificationsTab } from "@/components/ClassCertificationsTab";
import { ProjectCertificationsTab } from "@/components/ProjectCertificationsTab";
import { MyProjectsTab } from "@/components/MyProjectsTab";
import { TrainingGoalsTab } from "@/components/TrainingGoalsTab";

export default function MyJourneyPage() {
  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Journey</h1>
        <p className="text-muted-foreground mt-1">
          Track your progress and milestones across the Tech Fleet platform.
        </p>
      </div>

      <Tabs defaultValue="training-goals" className="space-y-6">
        <TabsList>
          <TabsTrigger value="training-goals">Training Goals</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="my-projects">My Projects</TabsTrigger>
          <TabsTrigger value="certifications">Class Certifications</TabsTrigger>
          <TabsTrigger value="project-certifications">Project Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="training-goals">
          <TrainingGoalsTab />
        </TabsContent>

        <TabsContent value="overview">
          <div className="card-elevated p-12 text-center">
            <p className="text-muted-foreground">
              Journey overview is coming soon.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="my-projects">
          <MyProjectsTab />
        </TabsContent>

        <TabsContent value="certifications">
          <ClassCertificationsTab />
        </TabsContent>

        <TabsContent value="project-certifications">
          <ProjectCertificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
