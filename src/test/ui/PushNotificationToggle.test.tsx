import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    isSupported: true,
    isSubscribed: false,
    permission: "default",
    loading: false,
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
  }),
}));

describe("PushNotificationToggle UI (BDD PUSH-005)", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
    unsubscribeMock.mockReset();
  });

  it("shows the detailed push error message instead of a generic fallback", async () => {
    const { toast } = await import("sonner");
    subscribeMock.mockResolvedValue({
      status: "error",
      message: "Your browser allowed notifications, but we couldn't save this device for alerts.",
    });

    render(<PushNotificationToggle />);

    fireEvent.click(screen.getByRole("button", { name: /enable push notifications/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Your browser allowed notifications, but we couldn't save this device for alerts.",
        expect.objectContaining({
          description: "The detailed failure was sent to the Activity Log for troubleshooting.",
        }),
      );
    });
  });
});