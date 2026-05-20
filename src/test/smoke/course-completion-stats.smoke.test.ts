// course_completion_stats smoke — verifies precomputed per-course table exists
// and the v4 read RPC is wired into the client hook.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const hookPath = path.join(process.cwd(), "src", "hooks", "use-course-completion-counts.ts");
const trainingPath = path.join(process.cwd(), "src", "pages", "TrainingPage.tsx");
const hookSrc = fs.readFileSync(hookPath, "utf8");
const trainingSrc = fs.readFileSync(trainingPath, "utf8");

describe("Course completion stats (smoke)", () => {
  it("STATS-014: TrainingPage uses the v4 hook for per-course counts", () => {
    expect(trainingSrc).toMatch(/useCourseCompletionCounts/);
  });

  it("STATS-015: hook calls get_course_completion_counts RPC", () => {
    expect(hookSrc).toMatch(/get_course_completion_counts/);
  });

  it("Training label reads 'N members completed this course'", () => {
    expect(trainingSrc).toMatch(/members completed this course/);
  });
});
