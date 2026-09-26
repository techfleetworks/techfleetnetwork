import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the single supabase client that invokeEdge calls through.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { invokeEdge } from "@/lib/edge/invokeEdge";

describe("invokeEdge — HTTP method passthrough (ADR-0028 GET support)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("forwards method:'GET' to supabase.functions.invoke and returns the data directly", async () => {
    invokeMock.mockResolvedValue({ data: { events: [{ id: 1 }] }, error: null });

    const data = await invokeEdge<{ events: { id: number }[] }>("get-community-events", {
      method: "GET",
    });

    expect(data).toEqual({ events: [{ id: 1 }] });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fn, opts] = invokeMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("get-community-events");
    expect(opts.method).toBe("GET");
    // x-trace-id is always attached by the wrapper.
    expect((opts.headers as Record<string, string>)["x-trace-id"]).toBeTruthy();
  });

  it("omits method (supabase-js POST default) when not specified", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });

    await invokeEdge("some-fn", { body: { a: 1 } });

    const [, opts] = invokeMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.method).toBeUndefined();
    expect(opts.body).toEqual({ a: 1 });
  });
});
