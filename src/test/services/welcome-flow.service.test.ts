import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileService } from "@/services/profile.service";
import { supabase } from "@/integrations/supabase/client";

// Covers (bdd-gate): src/services/profile.service.ts — the Welcome Flow completion seam
// (fetch-select column, markWelcomeFlowComplete set-once write, getWelcomeFlowCompletionCount).

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
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
const from = vi.mocked(supabase.from);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileService.fetch — welcome completion column", () => {
  it("selects welcome_flow_completed_at so the gate can read it", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select } as never);

    await ProfileService.fetch("user-1");

    expect(select).toHaveBeenCalledTimes(1);
    expect(String(select.mock.calls[0][0])).toContain("welcome_flow_completed_at");
  });
});

describe("ProfileService.markWelcomeFlowComplete", () => {
  it("calls the no-arg set-once RPC and never sends a client user_id", async () => {
    rpc.mockResolvedValue({ data: "2026-10-13T00:00:00Z", error: null } as never);

    await ProfileService.markWelcomeFlowComplete("user-1", { timeoutMs: 100 });

    const markCall = rpc.mock.calls.find((c) => c[0] === "mark_welcome_flow_complete");
    expect(markCall).toBeTruthy();
    // No second argument — the RPC derives the user from auth.uid(); a caller cannot
    // forge another user's completion.
    expect(markCall?.[1]).toBeUndefined();
  });

  it("propagates a write error (so the finish CTA can surface Retry)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } } as never);

    await expect(
      ProfileService.markWelcomeFlowComplete("user-1", { timeoutMs: 100 }),
    ).rejects.toBeTruthy();
  });
});

describe("ProfileService.getWelcomeFlowCompletionCount", () => {
  it("returns the live scalar from the owning RPC", async () => {
    rpc.mockResolvedValue({ data: 42, error: null } as never);

    await expect(ProfileService.getWelcomeFlowCompletionCount()).resolves.toBe(42);
    expect(rpc).toHaveBeenCalledWith("get_welcome_flow_completion_count");
  });

  it("coerces a null/absent count to 0", async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    await expect(ProfileService.getWelcomeFlowCompletionCount()).resolves.toBe(0);
  });

  it("throws when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } } as never);
    await expect(ProfileService.getWelcomeFlowCompletionCount()).rejects.toThrow(
      /completion count/i,
    );
  });
});
