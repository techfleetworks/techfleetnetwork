// bdd-gate coverage: src/services/error-reporter.service.ts
// ADR-0031: recordClassifiedDrop feeds the SAME per-minute aggregate the reporter
// already uses for suppression/dedup — proving report()'s classifier-drop tier is a
// real recorder (one aggregate row per reason/source per flush), not a no-op, and
// NOT a per-occurrence write (ADR-0021 preserved).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}));

import { recordClassifiedDrop } from "@/services/error-reporter.service";

type AuditPayload = {
  p_event_type: string;
  p_changed_fields: string[];
  p_error_message: string;
};
const auditRows = (): AuditPayload[] =>
  rpc.mock.calls.filter(([fn]) => fn === "write_audit_log").map(([, p]) => p as AuditPayload);

describe("recordClassifiedDrop (ADR-0031)", () => {
  beforeEach(() => {
    rpc.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses N drops of one (reason, source) into ONE aggregate client_error_suppressed row", async () => {
    recordClassifiedDrop("infra_transient", "edge.write-exploration-cache");
    recordClassifiedDrop("infra_transient", "edge.write-exploration-cache");
    // Aggregate, not per-occurrence: nothing is written until the flush window elapses.
    expect(auditRows()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(60_000);

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].p_event_type).toBe("client_error_suppressed");
    expect(rows[0].p_changed_fields).toEqual(
      expect.arrayContaining([expect.stringContaining("classified:infra_transient"), "count:2"])
    );
  });

  it("keeps distinct reasons/sources as separate aggregate rows", async () => {
    recordClassifiedDrop("infra_transient", "edge.a");
    recordClassifiedDrop("offline", "edge.b");
    await vi.advanceTimersByTimeAsync(60_000);

    const tags = auditRows().flatMap((r) =>
      r.p_changed_fields.filter((f) => f.startsWith("classified:"))
    );
    expect(tags).toEqual(
      expect.arrayContaining(["classified:infra_transient", "classified:offline"])
    );
  });
});
