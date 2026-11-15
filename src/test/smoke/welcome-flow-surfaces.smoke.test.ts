import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Covers (bdd-gate): src/pages/TrainingPage.tsx + src/pages/DashboardPage.tsx — PR4 wires
// the Welcome Flow into Courses (§4.11) and the Dashboard Get Started card (§4.10), and
// retires the legacy WelcomeWizard / WelcomeDialog. These are source-level regression
// guards: the surfaces are heavy to fully render, but the wiring must not silently regress
// (the card vanishing, the stored-counter anti-pattern creeping back, or the legacy dialog
// returning).

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Welcome Flow surfaces (PR4)", () => {
  it("Courses lists the Welcome Flow as a re-enterable entry (§4.11)", () => {
    const src = read("src/pages/TrainingPage.tsx");
    expect(src).toContain('id: "welcome-flow"');
    expect(src).toContain('href: "/welcome"');
    // Live-derived count via the owning hook — never a stored counter (ADR-0050).
    expect(src).toContain("useWelcomeFlowCompletionCount");
    expect(src).not.toContain("welcome_flow_stats");
  });

  it("Dashboard Get Started shows a Welcome card reflecting the server flag (§4.10)", () => {
    const src = read("src/pages/DashboardPage.tsx");
    expect(src).toContain('id: "welcome-flow"');
    expect(src).toContain('href: "/welcome"');
    // Reflection of the single-owner completion flag, not a second copy.
    expect(src).toContain("welcome_flow_completed_at");
  });

  it("retires the legacy WelcomeWizard + WelcomeDialog and their render", () => {
    expect(existsSync(join(process.cwd(), "src/components/WelcomeDialog.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/pages/WelcomeWizard.tsx"))).toBe(false);
    const dash = read("src/pages/DashboardPage.tsx");
    expect(dash).not.toContain("WelcomeDialog");
  });
});
