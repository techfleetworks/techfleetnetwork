import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  welcomeProfileSchema,
  WELCOME_PROFILE_FIELDS,
} from "@/lib/validators/welcome-profile";
import { ProfileService } from "@/services/profile.service";
import { supabase } from "@/integrations/supabase/client";

// Covers (bdd-gate): src/services/profile.service.ts allow-list parity for step (f).

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

describe("welcomeProfileSchema (step f — optional to advance)", () => {
  it("accepts all-empty values (nothing is required to advance, P11)", () => {
    const result = welcomeProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an invalid URL but accepts an empty one", () => {
    expect(welcomeProfileSchema.safeParse({ portfolio_url: "" }).success).toBe(true);
    expect(
      welcomeProfileSchema.safeParse({ portfolio_url: "javascript:alert(1)" }).success,
    ).toBe(false);
  });

  it("normalizes a scheme-less URL to https", () => {
    const parsed = welcomeProfileSchema.parse({ linkedin_url: "linkedin.com/in/x" });
    expect(parsed.linkedin_url).toBe("https://linkedin.com/in/x");
  });
});

describe("step-f field / allow-list parity (AC-f3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("every welcome-profile field survives ProfileService.updateFields (none dropped)", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    // Give every field a value, then assert the allow-list kept each key.
    const input = Object.fromEntries(
      WELCOME_PROFILE_FIELDS.map((f) => [f, f.endsWith("_url") ? "https://example.com" : "x"]),
    );
    await ProfileService.updateFields("user-1", input);

    const written = update.mock.calls[0][0] as Record<string, unknown>;
    for (const field of WELCOME_PROFILE_FIELDS) {
      expect(written).toHaveProperty(field);
    }
  });
});
