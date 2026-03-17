import {
  DISCORD_COURSE_SECTIONS,
  ALL_DISCORD_LESSONS,
  ALL_DISCORD_LESSON_IDS,
  TOTAL_DISCORD_LESSONS,
} from "@/data/discord-course";
import GenericCoursePage from "@/components/GenericCoursePage";

export default function DiscordCoursePage() {
  return (
    <GenericCoursePage
      title="Discord Learning Series"
      subtitle={`Complete the ${TOTAL_DISCORD_LESSONS} lessons to learn how to use Discord in the Tech Fleet community.`}
      backTo="/courses"
      backLabel="Back to Courses"
      phase="discord_learning"
      sections={DISCORD_COURSE_SECTIONS}
      allLessons={ALL_DISCORD_LESSONS}
      allLessonIds={ALL_DISCORD_LESSON_IDS}
      totalLessons={TOTAL_DISCORD_LESSONS}
      completionMessage="🎉 Discord Learning Series Complete!"
      completionSubtext="You're ready to make the most of the Tech Fleet Discord community!"
      nextCourse={{ title: "Learn About Agile Teamwork", href: "/courses/agile-teamwork" }}
    />
  );
}
