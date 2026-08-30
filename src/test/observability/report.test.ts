// ADR-0031: report() must route a classifier drop into the aggregate recorder
// (recordClassifiedDrop) rather than silently returning, while a genuine error
// still goes to the per-incident reporter. classify() runs for real here; only
// the sink (error-reporter.service) is mocked so we can observe which tier fires.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/error-reporter.service", () => ({
  reportError: vi.fn(),
  reportActivity: vi.fn(),
  reportRecovery: vi.fn(),
  reportValidationRejection: vi.fn(),
  recordClassifiedDrop: vi.fn(),
}));

import { report } from "@/lib/observability/report";
import { reportError, recordClassifiedDrop } from "@/services/error-reporter.service";

describe("report() — ADR-0031: a classified drop is never a black hole", () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    vi.mocked(recordClassifiedDrop).mockClear();
  });

  it("routes a genuine error to the per-incident reporter (actionable tier)", () => {
    report(new Error("boom — real bug"), { source: "svc.doThing" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(recordClassifiedDrop).not.toHaveBeenCalled();
  });

  it("records a transient drop in AGGREGATE, not as a per-occurrence report (ADR-0021 preserved)", () => {
    report(new Error("connection timeout"), { source: "edge.write-exploration-cache" });
    expect(recordClassifiedDrop).toHaveBeenCalledWith(
      "infra_transient",
      "edge.write-exploration-cache"
    );
    // The whole point: a dropped transient must NOT create a per-incident audit/Triage row.
    expect(reportError).not.toHaveBeenCalled();
  });

  it("records an aborted drop too, preserving the classifier reason", () => {
    const abort = Object.assign(new Error("The user aborted a request."), { name: "AbortError" });
    report(abort, { source: "query.foo" });
    expect(recordClassifiedDrop).toHaveBeenCalledWith("aborted", "query.foo");
    expect(reportError).not.toHaveBeenCalled();
  });
});
