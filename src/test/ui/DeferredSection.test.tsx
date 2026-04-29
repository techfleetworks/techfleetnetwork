import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DeferredSection } from "@/components/DeferredSection";

describe("DeferredSection", () => {
  it("PERF-DEFERRED-NETWORK-ACTIVITY-038: renders fallback before intersection", () => {
    render(
      <DeferredSection fallback={<div>Reserved loading area</div>} minHeight={320}>
        <div>Deferred content</div>
      </DeferredSection>
    );

    expect(screen.getByText("Reserved loading area")).toBeInTheDocument();
    expect(screen.queryByText("Deferred content")).not.toBeInTheDocument();
  });

  it("PERF-DEFERRED-NETWORK-ACTIVITY-038: reveals content on bounded timeout fallback", () => {
    vi.useFakeTimers();
    render(
      <DeferredSection fallback={<div>Reserved loading area</div>} minHeight={320} timeoutMs={100}>
        <div>Deferred content</div>
      </DeferredSection>
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("Deferred content")).toBeInTheDocument();
    vi.useRealTimers();
  });
});