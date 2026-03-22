import GenericCoursePage from "@/components/GenericCoursePage";
import {
  OBSERVER_COURSE_SECTIONS,
  ALL_OBSERVER_LESSONS,
  ALL_OBSERVER_LESSON_IDS,
  TOTAL_OBSERVER_LESSONS,
} from "@/data/observer-course";

export default function ObserverCoursePage() {
  return (
    <GenericCoursePage
      title="Observer Course"
      subtitle={`Work through the ${TOTAL_OBSERVER_LESSONS} lessons of the Observer Handbook. Learn how to observe Tech Fleet project teams and prepare for apprenticeship.`}
      backTo="/courses"
      backLabel="Back to Courses"
      phase="observer"
      sections={OBSERVER_COURSE_SECTIONS}
      allLessons={ALL_OBSERVER_LESSONS}
      allLessonIds={ALL_OBSERVER_LESSON_IDS}
      totalLessons={TOTAL_OBSERVER_LESSONS}
      completionMessage="🎉 Observer Course Complete!"
      completionSubtext="You've completed all lessons. You're ready to start observing Tech Fleet project teams!"
      nextCourse={{ title: "Join Project Training Teams", href: "/courses/project-training" }}
    />
  );
}
