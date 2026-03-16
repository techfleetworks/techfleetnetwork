import { describe, it, expect, vi } from "vitest";
import { screen, render, fireEvent } from "@testing-library/react";
import { CommunityAgreementPanel } from "@/components/CommunityAgreementPanel";

describe("CommunityAgreementPanel UI (BDD 29.1–29.2)", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    onAccepted: vi.fn(),
    loading: false,
  };

  it("29.1: renders agreement title and description", () => {
    render(<CommunityAgreementPanel {...baseProps} />);
    expect(screen.getByText("Community Collective Agreement")).toBeInTheDocument();
    expect(screen.getByText(/please read the full agreement/i)).toBeInTheDocument();
  });

  it("29.1: renders agreement content", () => {
    render(<CommunityAgreementPanel {...baseProps} />);
    expect(screen.getByText(/tech fleet collective agreement/i)).toBeInTheDocument();
  });

  it("29.1: renders checkbox and accept button", () => {
    render(<CommunityAgreementPanel {...baseProps} />);
    expect(screen.getByText(/i have read and agree/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept agreement/i })).toBeInTheDocument();
  });

  it("29.2: accept button is disabled when checkbox unchecked", () => {
    render(<CommunityAgreementPanel {...baseProps} />);
    const acceptBtn = screen.getByRole("button", { name: /accept agreement/i });
    expect(acceptBtn).toBeDisabled();
  });

  it("29.2: accept button becomes enabled after checking checkbox", () => {
    render(<CommunityAgreementPanel {...baseProps} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    const acceptBtn = screen.getByRole("button", { name: /accept agreement/i });
    expect(acceptBtn).not.toBeDisabled();
  });
});
