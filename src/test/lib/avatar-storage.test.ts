import { describe, expect, it } from "vitest";
import { extractAvatarPath } from "@/lib/avatar-storage";

describe("avatar storage path validation", () => {
  it("SEC-AVATAR-PRIVATE-029: keeps valid private avatar object paths", () => {
    expect(extractAvatarPath("user-123/avatar.png")).toBe("user-123/avatar.png");
  });

  it("SEC-AVATAR-PRIVATE-029: extracts avatar paths from legacy public URLs", () => {
    expect(extractAvatarPath("https://example.test/storage/v1/object/public/avatars/user-123/avatar.jpg?t=1")).toBe("user-123/avatar.jpg");
  });

  it("SEC-AVATAR-PRIVATE-029: rejects arbitrary external image URLs", () => {
    expect(extractAvatarPath("https://evil.example/avatar.png")).toBeNull();
  });
});