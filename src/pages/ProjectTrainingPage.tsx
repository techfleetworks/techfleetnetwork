import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { JourneyService } from "@/services/journey.service";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import {
  PROJECT_TRAINING_SECTIONS,
  ALL_PROJECT_TRAINING_LESSONS,
  ALL_PROJECT_TRAINING_LESSON_IDS,
  TOTAL_PROJECT_TRAINING_LESSONS,
} from "@/data/project-training-course";
import GenericCoursePage from "@/components/GenericCoursePage";

export default function ProjectTrainingPage() {
  const { user } = useAuth();
  const [prereqMet, setPrereqMet] = useState(false);
  const [prereqLoaded, setPrereqLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    JourneyService.getCompletedCount(user.id, "third_steps").then((count) => {
      setPrereqMet(count >= TOTAL_TEAMWORK_LESSONS);
      setPrereqLoaded(true);
    });
  }, [user]);

  return (
    <GenericCoursePage
      title="Join Project Training Teams"
      subtitle={`Complete the ${TOTAL_PROJECT_TRAINING_LESSONS} lessons to learn how project training works at Tech Fleet.`}
      backTo="/courses"
      backLabel="Back to Courses"
      phase="project_training"
      sections={PROJECT_TRAINING_SECTIONS}
      allLessons={ALL_PROJECT_TRAINING_LESSONS}
      allLessonIds={ALL_PROJECT_TRAINING_LESSON_IDS}
      totalLessons={TOTAL_PROJECT_TRAINING_LESSONS}
      completionMessage="🎉 Project Training Course Complete!"
      completionSubtext="You're ready to join a project training team!"
      nextCourse={{ title: "Join Volunteer Teams", href: "/courses/volunteer-teams" }}
      prerequisite={{
        met: prereqMet,
        loaded: prereqLoaded,
        courseName: "Agile Cross-Functional Team Dynamics",
        courseHref: "/courses/agile-teamwork",
      }}
    />
  );
}
