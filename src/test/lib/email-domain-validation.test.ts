import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { __emailDomainValidationTestHooks, validateEmailDomainExists } from "@/lib/email-domain-validation";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe("email domain validation (BDD AUTH-REAL-EMAIL-DOMAIN-20260427)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __emailDomainValidationTestHooks.domainCache.clear();
  });

  it("blocks submission when the backend reports a non-existent email domain", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { valid: false }, error: null });

    await expect(validateEmailDomainExists("person@does-not-exist.invalid")).resolves.toMatchObject({ valid: false });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("validate-email-domain", { body: { domain: "does-not-exist.invalid" } });
  });

  it("sends only the domain portion to the backend", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { valid: true }, error: null });

    await validateEmailDomainExists("private.name@example.com");
    expect(JSON.stringify(vi.mocked(supabase.functions.invoke).mock.calls[0])).not.toContain("private.name");
  });
});
