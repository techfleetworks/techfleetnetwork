import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { JourneyService } from "@/services/journey.service";
import { TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import {
  VOLUNTEER_TEAMS_SECTIONS,
  ALL_VOLUNTEER_LESSONS,
  ALL_VOLUNTEER_LESSON_IDS,
  TOTAL_VOLUNTEER_LESSONS,
} from "@/data/volunteer-teams-course";
import GenericCoursePage from "@/components/GenericCoursePage";

export default function VolunteerTeamsPage() {
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
      title="Join Volunteer Teams"
      subtitle={`Complete the ${TOTAL_VOLUNTEER_LESSONS} lessons to learn how volunteer teams work at Tech Fleet.`}
      backTo="/courses"
      backLabel="Back to Courses"
      phase="volunteer"
      sections={VOLUNTEER_TEAMS_SECTIONS}
      allLessons={ALL_VOLUNTEER_LESSONS}
      allLessonIds={ALL_VOLUNTEER_LESSON_IDS}
      totalLessons={TOTAL_VOLUNTEER_LESSONS}
      completionMessage="🎉 Volunteer Teams Course Complete!"
      completionSubtext="You're ready to join a volunteer team!"
      prerequisite={{
        met: prereqMet,
        loaded: prereqLoaded,
        courseName: "Agile Cross-Functional Team Dynamics",
        courseHref: "/courses/agile-teamwork",
      }}
    />
  );
}
