/**
 * Universal info architecture lock-in: every Card across the system
 * must render CardTitle as <h2> and CardDescription as <h3> by default.
 * Tight surfaces can override via `as="h4"` etc. — but the default contract
 * is non-negotiable. If someone regresses ui/card.tsx, this test fails.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

describe("Card typography contract", () => {
  it("CardTitle defaults to <h2>", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Hello</CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Hello");
  });

  it("CardDescription defaults to <h3>", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardDescription>Sub</CardDescription>
        </CardHeader>
      </Card>,
    );
    expect(container.querySelector("h3")?.textContent).toBe("Sub");
  });

  it("CardTitle respects the `as` escape hatch", () => {
    const { container } = render(<CardTitle as="h4">KPI</CardTitle>);
    expect(container.querySelector("h4")?.textContent).toBe("KPI");
    expect(container.querySelector("h2")).toBeNull();
  });

  it("CardDescription respects the `as` escape hatch", () => {
    const { container } = render(<CardDescription as="p">caption</CardDescription>);
    expect(container.querySelector("p")?.textContent).toBe("caption");
    expect(container.querySelector("h3")).toBeNull();
  });
});
