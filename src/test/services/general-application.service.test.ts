// bdd-gate coverage: src/services/general-application.service.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Airtable is deprecated: general_applications is the single source of truth in
// Supabase, and the old fire-and-forget sync-airtable edge invoke was deleted.
// These tests lock that in — save() must write to Supabase and must NOT call any
// edge function.
const invokeSpy = vi.fn();
const fromSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const record = {
    id: "app-1",
    user_id: "user-1",
    email: "a@b.com",
    status: "draft",
    title: "T",
    about_yourself: "",
  };
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "delete", "eq", "order", "limit"]) {
      chain[m] = vi.fn(() => chain);
    }
    // fetch()/getProfileEmail() terminal
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: record, error: null }));
    chain.single = vi.fn(() => Promise.resolve({ data: record, error: null }));
    // save()'s update(...).eq(...).select("id") is awaited directly → one written row
    (chain as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "app-1" }], error: null }).then(onF, onR);
    return chain;
  };
  return {
    supabase: {
      from: (...args: unknown[]) => {
        fromSpy(...args);
        return makeChain();
      },
      functions: {
        invoke: (...args: unknown[]) => {
          invokeSpy(...args);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  };
});

import { GeneralApplicationService } from "@/services/general-application.service";

describe("GeneralApplicationService — Supabase is the only sync target (Airtable removed)", () => {
  beforeEach(() => {
    invokeSpy.mockClear();
    fromSpy.mockClear();
  });

  it("save() persists to the general_applications Supabase table", async () => {
    await GeneralApplicationService.save("app-1", { title: "Updated title" });
    expect(fromSpy).toHaveBeenCalledWith("general_applications");
  });

  it("save() calls no edge function (the sync-airtable invoke is deleted)", async () => {
    await GeneralApplicationService.save("app-1", { title: "Updated title" });
    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
