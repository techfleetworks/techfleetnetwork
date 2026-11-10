import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock the single supabase client that invokeEdge calls through.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));
// Stub the observability sink so a reported contract failure never attempts a real send in tests.
const reportMock = vi.fn();
vi.mock("@/lib/observability/report", () => ({ report: (...args: unknown[]) => reportMock(...args) }));

import { invokeEdge } from "@/lib/edge/invokeEdge";
import { EdgeInvokeError } from "@/lib/errors/AppError";

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

// ── ARCH-2 / ARCH-4: the request/response CONTRACT must be enforced, not assumed ──────────────
// These are discrimination tests: each one reds if the matching validation block is deleted from
// invokeEdge.ts, which is what makes the "a shape drift fails silently at runtime" audit finding
// stay fixed. They pin the behavior the handoff.service schemas (and every future adopter) rely on.
describe("invokeEdge — request/response contract enforcement", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    reportMock.mockReset();
  });

  const responseSchema = z.object({ run_id: z.string(), status: z.string() });
  const bodySchema = z.object({ project_id: z.string() }).strict();

  it("THROWS EdgeInvokeError when the response violates responseSchema (server-side drift caught)", async () => {
    // Server answers 200 but with the WRONG shape (missing run_id) — must not pass through silently.
    invokeMock.mockResolvedValue({ data: { status: "queued" }, error: null });

    await expect(invokeEdge("handoff-produce", { body: {}, responseSchema })).rejects.toThrow(
      /Invalid response from handoff-produce/
    );
    await expect(
      invokeEdge("handoff-produce", { body: {}, responseSchema })
    ).rejects.toBeInstanceOf(EdgeInvokeError);
  });

  it("returns the parsed data when the response satisfies responseSchema", async () => {
    invokeMock.mockResolvedValue({ data: { run_id: "r1", status: "queued", extra: 1 }, error: null });

    const out = await invokeEdge("handoff-produce", { body: {}, responseSchema });

    expect(out).toEqual({ run_id: "r1", status: "queued" }); // extra stripped by the schema
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("THROWS before sending when the request body violates bodySchema (client-side drift caught)", async () => {
    // Intentionally the WRONG shape — the cast mimics a real shape drift the compiler would otherwise
    // forbid, so the test exercises the RUNTIME bodySchema guard.
    const badBody = { wrong: true } as unknown as { project_id: string };
    await expect(
      invokeEdge("handoff-produce", { body: badBody, bodySchema })
    ).rejects.toThrow(/Invalid request body for handoff-produce/);
    // The bad request never reaches the network — validation fails fast.
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sends the request when the body satisfies bodySchema", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });

    await invokeEdge("handoff-produce", { body: { project_id: "p1" }, bodySchema });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [, opts] = invokeMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.body).toEqual({ project_id: "p1" });
  });
});
