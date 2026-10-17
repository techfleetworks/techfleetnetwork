import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingSubscriptionService } from "@/services/marketing-subscription.service";
import { supabase } from "@/integrations/supabase/client";

// Covers (bdd-gate): src/services/marketing-subscription.service.ts — the EO front-door
// seam for the Welcome Flow newsletter step (e).

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("@/services/logger.service", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    track: (_a: string, _m: string, _meta: unknown, fn: () => unknown) => fn(),
  }),
}));

const rpc = vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>);

beforeEach(() => vi.clearAllMocks());

describe("MarketingSubscriptionService.isSubscribed", () => {
  it("is true only when the stored intent is 'subscribed'", async () => {
    rpc.mockResolvedValue({ data: "subscribed", error: null } as never);
    await expect(MarketingSubscriptionService.isSubscribed()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_my_marketing_subscription");
  });

  it("is false for 'unsubscribed'", async () => {
    rpc.mockResolvedValue({ data: "unsubscribed", error: null } as never);
    await expect(MarketingSubscriptionService.isSubscribed()).resolves.toBe(false);
  });

  it("is false (OFF by default) when there is no stored intent", async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    await expect(MarketingSubscriptionService.isSubscribed()).resolves.toBe(false);
  });

  it("throws when the read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await expect(MarketingSubscriptionService.isSubscribed()).rejects.toThrow(
      /newsletter preference/i,
    );
  });
});

describe("MarketingSubscriptionService.setSubscribed", () => {
  it("records intent with the subscribed flag and source (no email param)", async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    await MarketingSubscriptionService.setSubscribed(true, "welcome_flow");
    expect(rpc).toHaveBeenCalledWith("set_my_marketing_subscription", {
      p_subscribed: true,
      p_source: "welcome_flow",
    });
  });

  it("throws when the write fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } } as never);
    await expect(
      MarketingSubscriptionService.setSubscribed(false, "welcome_flow"),
    ).rejects.toThrow(/newsletter choice/i);
  });
});
