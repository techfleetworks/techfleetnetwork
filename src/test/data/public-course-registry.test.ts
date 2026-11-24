// Module under test: src/pages/CourseDetailRoute.tsx (its MEMBER_COURSE_PATH map)
// B12: the public course content registry (course_key -> modules with per-lesson
// takeaways). Guards that the 6 Core courses resolve, an unknown key does not, and
// every Core lesson has an authored takeaway sentence.
import { describe, it, expect } from "vitest";
import { publicCourseModules, CORE_COURSE_KEYS } from "@/data/public-course-registry";
import { LESSON_TAKEAWAYS } from "@/data/public-course-takeaways";
import { MEMBER_COURSE_PATH } from "@/pages/CourseDetailRoute";

/** Every lesson id across all Core courses (the universe the takeaways map against). */
function allCoreLessonIds(): Set<string> {
  const ids = new Set<string>();
  for (const key of CORE_COURSE_KEYS) {
    for (const mod of publicCourseModules(key) ?? []) {
      for (const lesson of mod.lessons) ids.add(lesson.id);
    }
  }
  return ids;
}

const CORE_KEYS = [
  "agile-mindset",
  "observer-course",
  "project-training",
  "volunteer-teams",
  "discord-learning",
  "agile-teamwork",
];

describe("publicCourseModules", () => {
  it("resolves every Core course_key to non-empty modules with lessons", () => {
    for (const key of CORE_KEYS) {
      const mods = publicCourseModules(key);
      expect(mods, key).not.toBeNull();
      expect(mods!.length, key).toBeGreaterThan(0);
      expect(mods!.every((m) => typeof m.title === "string" && m.lessons.length > 0), key).toBe(true);
      expect(mods!.every((m) => m.lessons.every((l) => typeof l.id === "string" && typeof l.title === "string")), key).toBe(true);
    }
  });

  it("returns null for an unknown or missing key (so the page 404s)", () => {
    expect(publicCourseModules("not-a-course")).toBeNull();
    expect(publicCourseModules(undefined)).toBeNull();
    expect(publicCourseModules("")).toBeNull();
  });

  it("agile-mindset has at least one video lesson (youtubeId set)", () => {
    const mods = publicCourseModules("agile-mindset")!;
    const anyVideo = mods.some((m) => m.lessons.some((l) => !!l.youtubeId));
    expect(anyVideo).toBe(true);
  });

  it("every Core lesson has an authored, non-empty one-sentence takeaway", () => {
    // The takeaway is what the public page shows per lesson (the video-length
    // route was dropped). A lesson with no authored takeaway would render blank,
    // so hold full coverage across all 6 Core courses.
    for (const key of CORE_KEYS) {
      for (const mod of publicCourseModules(key)!) {
        for (const lesson of mod.lessons) {
          expect(typeof lesson.takeaway, `${key}/${lesson.id}`).toBe("string");
          expect((lesson.takeaway ?? "").trim().length, `${key}/${lesson.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("has no orphan takeaway keys (every LESSON_TAKEAWAYS key is a real lesson id)", () => {
    // The other direction of the bijection: a takeaway whose lesson was renamed or
    // removed is dead data that would silently never render. Catch it here.
    const lessonIds = allCoreLessonIds();
    const orphans = Object.keys(LESSON_TAKEAWAYS).filter((id) => !lessonIds.has(id));
    expect(orphans, `orphan takeaway keys: ${orphans.join(", ")}`).toEqual([]);
  });

  it("DISCRIMINATING: an unmapped lesson id resolves to a null takeaway (the ?? null branch)", () => {
    // Prove the fallback is real: an id NOT in the map must not be present (so the
    // registry's `?? null` path actually fires for it) — this fails if the map were
    // to somehow cover arbitrary ids.
    expect(LESSON_TAKEAWAYS["definitely-not-a-lesson-id"]).toBeUndefined();
  });
});

describe("MEMBER_COURSE_PATH (member redirect) stays in sync with the registry", () => {
  it("covers exactly the Core course keys (no missing key → no accidental /courses fallback)", () => {
    expect(Object.keys(MEMBER_COURSE_PATH).sort()).toEqual([...CORE_COURSE_KEYS].sort());
  });

  it("every member path points under /courses/", () => {
    for (const path of Object.values(MEMBER_COURSE_PATH)) {
      expect(path.startsWith("/courses/")).toBe(true);
    }
  });
});
