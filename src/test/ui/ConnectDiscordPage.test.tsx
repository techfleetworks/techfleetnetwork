import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithRouter } from "./test-utils";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const staleVisibilityMessage =
  "That Discord account is no longer visible in the Tech Fleet server. Please join the server, then search again.";

const mockResolveDiscordId = vi.fn();
const mockConfirmDiscordId = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", user_metadata: { full_name: "Test Member" } },
    profile: { discord_user_id: "", discord_username: "", display_name: "Test Member" },
    profileLoaded: true,
    refreshProfile: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-journey-progress", () => ({
  useJourneyProgress: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock("@/services/discord-notify.service", () => ({
  DISCORD_MEMBER_NOT_VISIBLE_MESSAGE: staleVisibilityMessage,
  DiscordNotifyService: {
    resolveDiscordId: mockResolveDiscordId,
    confirmDiscordId: mockConfirmDiscordId,
    discordVerified: vi.fn(),
  },
}));

vi.mock("@/services/journey.service", () => ({
  JourneyService: { upsertTask: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ConnectDiscordPage from "@/pages/ConnectDiscordPage";

describe("ConnectDiscordPage Discord member picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes a stale candidate after visibility confirmation fails so the user can search again", async () => {
    const user = userEvent.setup();
    mockResolveDiscordId.mockResolvedValue({
      discord_user_id: null,
      candidates: [
        { id: "111111111111111111", username: "stale.member", global_name: "Stale Member", nick: null, avatar: null },
        { id: "222222222222222222", username: "current.member", global_name: "Current Member", nick: null, avatar: null },
      ],
    });
    mockConfirmDiscordId.mockRejectedValue(new Error(staleVisibilityMessage));

    renderWithRouter(<ConnectDiscordPage />);

    await user.click(screen.getByRole("button", { name: /yes, i'm in discord/i }));
    await user.type(screen.getByLabelText(/discord username or display name/i), "member");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    await screen.findByText("Stale Member");

    await user.click(screen.getByRole("button", { name: /select stale member/i }));

    await waitFor(() => {
      expect(screen.queryByText("Stale Member")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/removed that stale result so you can search again now/i)).toBeInTheDocument();
    expect(screen.getByText("Current Member")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search again/i })).toBeEnabled();
  });
});