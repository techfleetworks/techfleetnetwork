import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassCertificationsTab } from "@/components/ClassCertificationsTab";

export default function MyJourneyPage() {
  return (
    <div className="container-app py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Journey</h1>
        <p className="text-muted-foreground mt-1">
          Track your progress and milestones across the Tech Fleet platform.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="certifications">Class Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="card-elevated p-12 text-center">
            <p className="text-muted-foreground">
              Journey overview is coming soon.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="certifications">
          <ClassCertificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
