import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __emailDomainValidationTestHooks,
  validateEmailDomainExists,
} from "@/lib/email-domain-validation";

// Migrated to invokeEdge (ADR-0028): invokeEdge returns the data directly and THROWS on failure,
// so we mock it (not supabase.functions.invoke) and assert the fail-OPEN behavior on a throw.
const { invokeEdgeMock } = vi.hoisted(() => ({ invokeEdgeMock: vi.fn() }));
vi.mock("@/lib/edge/invokeEdge", () => ({ invokeEdge: invokeEdgeMock }));

describe("email domain validation (BDD AUTH-REAL-EMAIL-DOMAIN-20260427)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __emailDomainValidationTestHooks.domainCache.clear();
  });

  it("blocks submission when the backend reports a non-existent email domain", async () => {
    invokeEdgeMock.mockResolvedValue({ valid: false });

    await expect(validateEmailDomainExists("person@does-not-exist.invalid")).resolves.toMatchObject(
      {
        valid: false,
      }
    );
    expect(invokeEdgeMock).toHaveBeenCalledWith(
      "validate-email-domain",
      expect.objectContaining({ body: { domain: "does-not-exist.invalid" } })
    );
  });

  it("sends only the domain portion to the backend", async () => {
    invokeEdgeMock.mockResolvedValue({ valid: true });

    await validateEmailDomainExists("private.name@example.com");
    expect(JSON.stringify(invokeEdgeMock.mock.calls[0])).not.toContain("private.name");
  });

  it("fails OPEN when the edge call throws (a validation-service outage must not block registration)", async () => {
    invokeEdgeMock.mockRejectedValue(new Error("edge down"));

    await expect(validateEmailDomainExists("person@example.com")).resolves.toEqual({ valid: true });
  });
});
