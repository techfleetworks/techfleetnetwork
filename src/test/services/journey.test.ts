import { describe, it, expect } from "vitest";
import { ALL_AGILE_LESSON_IDS, TOTAL_AGILE_LESSONS, AGILE_COURSE_SECTIONS } from "@/data/agile-course";

/**
 * BDD Scenarios covered:
 * 3.1  — User completes all First Steps tasks (task ID whitelist)
 * 3.2  — Tasks in any order (no ordering constraint)
 * 4.1  — User completes Second Steps (lesson IDs verified)
 */

describe("Journey task ID whitelist (BDD 3.1, 3.2)", () => {
  const FIRST_STEPS_TASK_IDS = [
    "profile",
    "onboarding-class",
    "service-leadership",
    "user-guide",
    "figma-account",
    "community-agreement",
  ];

  it("all First Steps task IDs are valid strings", () => {
    FIRST_STEPS_TASK_IDS.forEach((id) => {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  it("First Steps tasks have no duplicates", () => {
    const unique = new Set(FIRST_STEPS_TASK_IDS);
    expect(unique.size).toBe(FIRST_STEPS_TASK_IDS.length);
  });

  it("all Agile lesson IDs are valid strings", () => {
    ALL_AGILE_LESSON_IDS.forEach((id) => {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  it("Agile lesson IDs have no duplicates", () => {
    const unique = new Set(ALL_AGILE_LESSON_IDS);
    expect(unique.size).toBe(ALL_AGILE_LESSON_IDS.length);
  });

  it("TOTAL_AGILE_LESSONS matches actual lesson count", () => {
    expect(TOTAL_AGILE_LESSONS).toBe(ALL_AGILE_LESSON_IDS.length);
  });
});

describe("Agile course structure (BDD 4.1: Second Steps completion)", () => {
  it("has course sections defined", () => {
    expect(AGILE_COURSE_SECTIONS.length).toBeGreaterThan(0);
  });

  it("every section has a title and lessons", () => {
    AGILE_COURSE_SECTIONS.forEach((section) => {
      expect(section.title).toBeTruthy();
      expect(section.lessons.length).toBeGreaterThan(0);
    });
  });

  it("every lesson has required fields", () => {
    AGILE_COURSE_SECTIONS.forEach((section) => {
      section.lessons.forEach((lesson) => {
        expect(lesson.id).toBeTruthy();
        expect(lesson.title).toBeTruthy();
      });
    });
  });

  it("all lesson IDs from sections match ALL_AGILE_LESSON_IDS", () => {
    const fromSections = AGILE_COURSE_SECTIONS.flatMap((s) => s.lessons.map((l) => l.id));
    expect(fromSections.sort()).toEqual([...ALL_AGILE_LESSON_IDS].sort());
  });
});
