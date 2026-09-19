// Behavioral coverage for src/lib/policies.ts after the raw-invoke → invokeEdge migration
// (ADR-0028 / no-raw-functions-invoke). invokeEdge THROWS on failure (vs the old
// supabase.functions.invoke returning { error }), so these pin that the graceful queue-and-replay
// contract is preserved: success clears the pending marker; a throw queues it (record) or keeps it
// (flush) for a later attempt. invokeEdge is mocked so no network is touched.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeEdgeMock } = vi.hoisted(() => ({ invokeEdgeMock: vi.fn() }));
vi.mock("@/lib/edge/invokeEdge", () => ({ invokeEdge: invokeEdgeMock }));

import { recordPolicyAcknowledgment, flushPendingPolicyAcknowledgment } from "@/lib/policies";

const PENDING = "tfn.policy_ack_pending";

beforeEach(() => {
  invokeEdgeMock.mockReset();
  localStorage.clear();
});

describe("policies acknowledgment (invokeEdge migration)", () => {
  it("PA-001: records via invokeEdge (silentReport) and clears a stale pending marker on success", async () => {
    localStorage.setItem(PENDING, "stale");
    invokeEdgeMock.mockResolvedValueOnce(undefined);
    const r = await recordPolicyAcknowledgment("checkbox");
    expect(r).toEqual({ ok: true });
    expect(invokeEdgeMock).toHaveBeenCalledWith(
      "record-policy-acknowledgment",
      expect.objectContaining({ silentReport: true })
    );
    expect(localStorage.getItem(PENDING)).toBeNull();
  });

  it("PA-002: queues the ack for replay when invokeEdge throws (graceful recover, ok:false)", async () => {
    invokeEdgeMock.mockRejectedValueOnce(new Error("edge down"));
    const r = await recordPolicyAcknowledgment("registration", { electronicCommsConsent: true });
    expect(r).toEqual({ ok: false });
    const queued = JSON.parse(localStorage.getItem(PENDING) ?? "null");
    expect(queued).toMatchObject({ method: "registration", electronic_comms: true });
    expect(queued.queuedAt).toBeTruthy();
  });

  it("PA-003: flush is a no-op when nothing is queued", async () => {
    await flushPendingPolicyAcknowledgment();
    expect(invokeEdgeMock).not.toHaveBeenCalled();
  });

  it("PA-004: flush replays a queued ack and removes the marker on success", async () => {
    localStorage.setItem(PENDING, JSON.stringify({ method: "checkbox" }));
    invokeEdgeMock.mockResolvedValueOnce(undefined);
    await flushPendingPolicyAcknowledgment();
    expect(invokeEdgeMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem(PENDING)).toBeNull();
  });

  it("PA-005: flush keeps the marker when the replay fails (retried on the next flush)", async () => {
    const marker = JSON.stringify({ method: "checkbox" });
    localStorage.setItem(PENDING, marker);
    invokeEdgeMock.mockRejectedValueOnce(new Error("edge down"));
    await flushPendingPolicyAcknowledgment();
    expect(localStorage.getItem(PENDING)).toBe(marker);
  });
});
