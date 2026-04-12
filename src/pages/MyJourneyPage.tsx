import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassCertificationsTab } from "@/components/ClassCertificationsTab";
import { ProjectCertificationsTab } from "@/components/ProjectCertificationsTab";
import { MyProjectsTab } from "@/components/MyProjectsTab";
import { TrainingGoalsTab } from "@/components/TrainingGoalsTab";
import { QuestIntakeWizard } from "@/components/quest/QuestIntakeWizard";
import { QuestRoadmap } from "@/components/quest/QuestRoadmap";
import { useUserQuestSelections } from "@/hooks/use-quest";

export default function MyJourneyPage() {
  const { data: selections, isLoading } = useUserQuestSelections();
  const [showIntake, setShowIntake] = useState(false);

  const handleNeedIntake = useCallback(() => {
    setShowIntake(true);
  }, []);

  const handleIntakeComplete = useCallback(() => {
    setShowIntake(false);
  }, []);

  const hasSelections = !isLoading && selections && selections.length > 0;

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
          <TabsTrigger value="training-goals">Training Goals</TabsTrigger>
          <TabsTrigger value="my-projects">My Projects</TabsTrigger>
          <TabsTrigger value="certifications">Class Certifications</TabsTrigger>
          <TabsTrigger value="project-certifications">Project Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : showIntake || !hasSelections ? (
            <QuestIntakeWizard onComplete={handleIntakeComplete} />
          ) : (
            <QuestRoadmap onNeedIntake={handleNeedIntake} />
          )}
        </TabsContent>

        <TabsContent value="training-goals">
          <TrainingGoalsTab />
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
