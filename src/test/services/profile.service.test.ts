import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileService } from "@/services/profile.service";
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

describe("ProfileService Discord identity protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not allow generic profile sync to overwrite verified Discord account fields", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    await ProfileService.updateFields("user-1", {
      country: "United States",
      discord_username: "@morgan",
      has_discord_account: true,
    });

    expect(update).toHaveBeenCalledWith({ country: "United States", has_discord_account: true });
    expect(JSON.stringify(update.mock.calls[0][0])).not.toContain("discord_username");
  });
});