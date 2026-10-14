import { describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoNext,
  clampStep,
  isLastStep,
  nextStep,
  prevStep,
} from "../navigation";

// Pure step-navigation mechanics — proven without rendering (§13 multi-step mechanics).
// `total` is the live registry length, never a hardcoded count.
describe("welcome flow navigation", () => {
  describe("clampStep", () => {
    it("keeps an in-range index unchanged", () => {
      expect(clampStep(1, 2)).toBe(1);
    });
    it("floors a negative index to 0", () => {
      expect(clampStep(-3, 2)).toBe(0);
    });
    it("caps an over-range index at the last step", () => {
      expect(clampStep(9, 2)).toBe(1);
    });
    it("collapses to 0 when there are no steps", () => {
      expect(clampStep(5, 0)).toBe(0);
    });
    it("collapses a non-finite index to 0", () => {
      expect(clampStep(Number.NaN, 3)).toBe(0);
    });
  });

  describe("canGoBack", () => {
    it("is disabled on the first step (AC: Back disabled on first step)", () => {
      expect(canGoBack(0)).toBe(false);
    });
    it("is enabled after the first step", () => {
      expect(canGoBack(1)).toBe(true);
    });
  });

  describe("canGoNext", () => {
    it("is enabled while a later step exists", () => {
      expect(canGoNext(0, 2)).toBe(true);
    });
    it("is disabled on the last built step", () => {
      expect(canGoNext(1, 2)).toBe(false);
    });
  });

  describe("isLastStep", () => {
    it("is true only on the final index", () => {
      expect(isLastStep(1, 2)).toBe(true);
      expect(isLastStep(0, 2)).toBe(false);
    });
    it("is false when there are no steps", () => {
      expect(isLastStep(0, 0)).toBe(false);
    });
  });

  describe("nextStep / prevStep", () => {
    it("advances but never past the last step", () => {
      expect(nextStep(0, 2)).toBe(1);
      expect(nextStep(1, 2)).toBe(1);
    });
    it("goes back but never below the first step", () => {
      expect(prevStep(1, 2)).toBe(0);
      expect(prevStep(0, 2)).toBe(0);
    });
  });
});
