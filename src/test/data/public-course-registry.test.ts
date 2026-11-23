// B12: the public course content registry (course_key -> modules) and video-id
// collection. Guards that the 6 Core courses resolve and an unknown key does not.
import { describe, it, expect } from "vitest";
import {
  publicCourseModules,
  courseVideoIds,
  type PublicModuleOutline,
} from "@/data/public-course-registry";

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
});

describe("courseVideoIds", () => {
  const modules: PublicModuleOutline[] = [
    { title: "A", lessons: [{ id: "1", title: "v", youtubeId: "iOHQRwqSvyE" }, { id: "2", title: "r", youtubeId: null }] },
    { title: "B", lessons: [{ id: "3", title: "v2", youtubeId: "iOHQRwqSvyE" }] }, // dup
  ];

  it("collects unique youtubeIds and drops readings (null)", () => {
    expect(courseVideoIds(modules)).toEqual(["iOHQRwqSvyE"]);
    expect(courseVideoIds(null)).toEqual([]);
    expect(courseVideoIds([])).toEqual([]);
  });
});
