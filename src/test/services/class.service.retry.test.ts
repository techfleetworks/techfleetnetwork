import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client BEFORE importing the service.
const insertChain = {
  insertMock: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: () => ({
        insert: (payload: unknown) => insertChain.insertMock(payload),
      }),
    },
  };
});

vi.mock("../../services/class-emails", () => ({ sendClassStatusEmails: vi.fn() }));

import { ClassService } from "@/services/class.service";
import { emptyClassFormValues } from "@/lib/forms/class-form-values";

function buildChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      maybeSingle: () => Promise.resolve(result),
    }),
  };
}

// Derive from the single source of truth for create-mode defaults so a new
// required ClassFormValues field can never leave this mock stale (which is what
// broke the typecheck when short_description/deliverables became required).
const validValues = {
  ...emptyClassFormValues,
  title: "AI Enabled Systems design",
  track: "advanced_training" as const,
};

beforeEach(() => {
  insertChain.insertMock.mockReset();
});

describe("ClassService.create retry behavior", () => {
  it("retries on transient PGRST002 then succeeds", async () => {
    insertChain.insertMock
      .mockReturnValueOnce(buildChain({ data: null, error: { message: "schema cache miss", code: "PGRST002" } }))
      .mockReturnValueOnce(buildChain({ data: { id: "new-id" }, error: null }));

    const id = await ClassService.create("owner-1", validValues);
    expect(id).toBe("new-id");
    expect(insertChain.insertMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("does NOT retry on RLS (42501)", async () => {
    insertChain.insertMock.mockReturnValue(
      buildChain({ data: null, error: { message: "new row violates row-level security policy", code: "42501" } })
    );

    await expect(ClassService.create("owner-1", validValues)).rejects.toMatchObject({ code: "42501" });
    expect(insertChain.insertMock).toHaveBeenCalledTimes(1);
  });

  it("throws explicit message when insert returns no row (silent RLS hide)", async () => {
    insertChain.insertMock.mockReturnValue(buildChain({ data: null, error: null }));
    await expect(ClassService.create("owner-1", validValues)).rejects.toThrow(/not created/i);
  });

  it("gives up after 3 transient attempts", async () => {
    insertChain.insertMock.mockReturnValue(
      buildChain({ data: null, error: { message: "upstream request timeout" } })
    );
    await expect(ClassService.create("owner-1", validValues)).rejects.toMatchObject({
      message: "upstream request timeout",
    });
    expect(insertChain.insertMock).toHaveBeenCalledTimes(3);
  }, 15_000);
});
