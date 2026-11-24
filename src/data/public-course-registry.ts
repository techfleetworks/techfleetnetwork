// Public course content registry (public-access B12). Maps a Core course_key to
// its module/lesson structure, which lives client-side in src/data/*-course.ts
// (the §6 gateway carries the OUTLINE only — order/keys — never titles/videos/
// bodies; lesson copy is bundled in the frontend, readable logged-out by design).
//
// The PUBLIC class detail page reads modules from here. Which courses are public
// and their display label stay owned by the public-courses gateway (System A, A8);
// this file is only the content-shape adapter over the already-public src/data.
import type { CourseSection } from "@/data/project-training-course";
import { AGILE_COURSE_SECTIONS } from "./agile-course";
import { OBSERVER_COURSE_SECTIONS } from "./observer-course";
import { PROJECT_TRAINING_SECTIONS } from "./project-training-course";
import { VOLUNTEER_TEAMS_SECTIONS } from "./volunteer-teams-course";
import { DISCORD_COURSE_SECTIONS } from "./discord-course";
import { TEAMWORK_COURSE_SECTIONS } from "./teamwork-course";
import { LESSON_TAKEAWAYS } from "./public-course-takeaways";

/** A lesson as the public overview shows it (no body/sourceUrl needed here). */
export interface PublicLessonOutline {
  id: string;
  title: string;
  /** YouTube id when the lesson is a video; null for a reading. */
  youtubeId: string | null;
  /** One plain-English sentence on the lesson's key point; null if none authored. */
  takeaway: string | null;
}

/** A module (CourseSection) = a titled group of lessons. */
export interface PublicModuleOutline {
  title: string;
  lessons: PublicLessonOutline[];
}

// Core course_key → its sections. Keys MUST match course_catalog.course_key (the
// values the public-courses gateway returns). TeamworkCourseSection is structurally
// a CourseSection (title + lessons{id,title,youtubeId,...}); the cast is shape-safe.
const CORE_COURSE_SECTIONS: Record<string, CourseSection[]> = {
  "agile-mindset": AGILE_COURSE_SECTIONS,
  "observer-course": OBSERVER_COURSE_SECTIONS,
  "project-training": PROJECT_TRAINING_SECTIONS,
  "volunteer-teams": VOLUNTEER_TEAMS_SECTIONS,
  "discord-learning": DISCORD_COURSE_SECTIONS,
  "agile-teamwork": TEAMWORK_COURSE_SECTIONS as CourseSection[],
};

/** The known public Core course keys (must match course_catalog.course_key, tier=core). */
export const CORE_COURSE_KEYS = Object.keys(CORE_COURSE_SECTIONS);

/** The modules for a core course, or null if the key is not a known public course. */
export function publicCourseModules(courseKey: string | undefined): PublicModuleOutline[] | null {
  if (!courseKey) return null;
  const sections = CORE_COURSE_SECTIONS[courseKey];
  if (!sections) return null;
  return sections.map((s) => ({
    title: s.title,
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      youtubeId: l.youtubeId,
      takeaway: LESSON_TAKEAWAYS[l.id] ?? null,
    })),
  }));
}
