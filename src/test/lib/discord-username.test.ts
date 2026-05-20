import { describe, it, expect } from "vitest";
import {
  isUsableDiscordUsername,
  normalizeDiscordSearchInput,
} from "@/lib/discord/username";

describe("isUsableDiscordUsername", () => {
  it.each([
    [null, false],
    [undefined, false],
    ["", false],
    ["   ", false],
    [".", false],
    ["..", false],
    ["...   ", false],
    ["alice", true],
    ["alice.42", true],
    [".alice", true], // legit dot-leading handle
    ["  bob  ", true],
  ])("isUsableDiscordUsername(%p) === %p", (input, expected) => {
    expect(isUsableDiscordUsername(input as unknown)).toBe(expected);
  });

  it("rejects non-strings", () => {
    expect(isUsableDiscordUsername(123)).toBe(false);
    expect(isUsableDiscordUsername({})).toBe(false);
    expect(isUsableDiscordUsername([])).toBe(false);
  });
});

describe("normalizeDiscordSearchInput", () => {
  it("never prepends a dot", () => {
    expect(normalizeDiscordSearchInput("alice")).toBe("alice");
    expect(normalizeDiscordSearchInput("Alice")).toBe("alice");
    expect(normalizeDiscordSearchInput("@alice")).toBe("alice");
    expect(normalizeDiscordSearchInput("  @Alice  ")).toBe("alice");
  });

  it("returns empty for empty/whitespace input", () => {
    expect(normalizeDiscordSearchInput("")).toBe("");
    expect(normalizeDiscordSearchInput("   ")).toBe("");
  });

  it("handles non-string input safely", () => {
    // @ts-expect-error guarded at runtime
    expect(normalizeDiscordSearchInput(null)).toBe("");
    // @ts-expect-error guarded at runtime
    expect(normalizeDiscordSearchInput(undefined)).toBe("");
  });
});
