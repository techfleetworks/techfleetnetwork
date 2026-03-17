import GenericCoursePage from "@/components/GenericCoursePage";
import {
  AGILE_COURSE_SECTIONS,
  ALL_AGILE_LESSONS,
  ALL_AGILE_LESSON_IDS,
  TOTAL_AGILE_LESSONS,
} from "@/data/agile-course";


export default function SecondStepsPage() {
  return (
    <GenericCoursePage
      title="Build an Agile Mindset"
      subtitle={`Work through the ${TOTAL_AGILE_LESSONS} lessons of the Agile Handbook. Open each lesson to watch the video or read the text, then mark it complete.`}
      backTo="/courses"
      backLabel="Back to Courses"
      phase="second_steps"
      sections={AGILE_COURSE_SECTIONS}
      allLessons={ALL_AGILE_LESSONS}
      allLessonIds={ALL_AGILE_LESSON_IDS}
      totalLessons={TOTAL_AGILE_LESSONS}
      completionMessage="🎉 Agile Handbook Complete!"
      completionSubtext="You've completed all lessons. You're ready for the next phase!"
    />
  );
}
