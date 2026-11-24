// B12: formatDuration (seconds -> "m:ss" / "h:mm:ss") for the course video lengths.
import { describe, it, expect } from "vitest";
import { formatDuration } from "@/hooks/use-youtube-durations";

describe("formatDuration", () => {
  it("formats minutes:seconds and hours:minutes:seconds", () => {
    expect(formatDuration(510)).toBe("8:30");
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("returns undefined for missing/invalid input (so no length renders)", () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(null)).toBeUndefined();
    expect(formatDuration(-5)).toBeUndefined();
    expect(formatDuration(Number.NaN)).toBeUndefined();
  });
});
