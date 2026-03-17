import { describe, it, expect } from "vitest";
import {
  ALL_DISCORD_LESSON_IDS,
  ALL_DISCORD_LESSONS,
  TOTAL_DISCORD_LESSONS,
  DISCORD_COURSE_SECTIONS,
} from "@/data/discord-course";

/**
 * BDD Scenarios covered:
 * 12.1 — Discord Learning Series appears on Courses page (data integrity)
 * 12.2 — Lesson IDs validated against whitelist
 * 12.3 — Discord course data integrity
 */

describe("Discord course data integrity (BDD 12.3)", () => {
  it("has course sections defined", () => {
    expect(DISCORD_COURSE_SECTIONS.length).toBeGreaterThan(0);
  });

  it("every section has a title and lessons", () => {
    DISCORD_COURSE_SECTIONS.forEach((section) => {
      expect(section.title).toBeTruthy();
      expect(section.lessons.length).toBeGreaterThan(0);
    });
  });

  it("every lesson has required fields", () => {
    DISCORD_COURSE_SECTIONS.forEach((section) => {
      section.lessons.forEach((lesson) => {
        expect(lesson.id).toBeTruthy();
        expect(lesson.title).toBeTruthy();
        expect(lesson.content).toBeTruthy();
        expect(lesson.sourceUrl).toBeTruthy();
      });
    });
  });

  it("all lesson IDs are unique", () => {
    const unique = new Set(ALL_DISCORD_LESSON_IDS);
    expect(unique.size).toBe(ALL_DISCORD_LESSON_IDS.length);
  });

  it("TOTAL_DISCORD_LESSONS matches actual lesson count", () => {
    expect(TOTAL_DISCORD_LESSONS).toBe(ALL_DISCORD_LESSON_IDS.length);
  });

  it("all lesson IDs from sections match ALL_DISCORD_LESSON_IDS", () => {
    const fromSections = DISCORD_COURSE_SECTIONS.flatMap((s) =>
      s.lessons.map((l) => l.id)
    );
    expect(fromSections.sort()).toEqual([...ALL_DISCORD_LESSON_IDS].sort());
  });

  it("ALL_DISCORD_LESSONS has same length as IDs", () => {
    expect(ALL_DISCORD_LESSONS.length).toBe(ALL_DISCORD_LESSON_IDS.length);
  });
});
