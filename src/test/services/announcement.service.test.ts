import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementService, extractAnnouncementMediaPath } from "@/services/announcement.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/services/logger.service", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    track: (_action: string, _message: string, _meta: unknown, fn: () => unknown) => fn(),
  }),
}));

describe("AnnouncementService private media handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("SEC-ANNOUNCEMENT-MEDIA-028: extracts only announcement media object paths from legacy public URLs", () => {
    const legacyUrl = "https://example.test/storage/v1/object/public/announcement-videos/video/123e4567-e89b-42d3-a456-426614174000.webm?t=1";

    expect(extractAnnouncementMediaPath(legacyUrl)).toBe("video/123e4567-e89b-42d3-a456-426614174000.webm");
  });

  it("SEC-ANNOUNCEMENT-MEDIA-028: stores media object paths instead of durable public URLs", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "ann-1", title: "Secure update", body_html: "<p>Body</p>", video_url: "video/123e4567-e89b-42d3-a456-426614174000.webm" },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await AnnouncementService.create(
      "Secure update",
      "<p>Body</p>",
      "user-1",
      "https://example.test/storage/v1/object/public/announcement-videos/video/123e4567-e89b-42d3-a456-426614174000.webm",
      null,
    );

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      video_url: "video/123e4567-e89b-42d3-a456-426614174000.webm",
    }));
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("/object/public/");
  });

  it("SEC-ANNOUNCEMENT-MEDIA-028: rejects arbitrary external media URLs", () => {
    expect(() => extractAnnouncementMediaPath("https://evil.example/video.webm")).toThrow();
  });
});