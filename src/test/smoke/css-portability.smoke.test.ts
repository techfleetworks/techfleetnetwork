// Smoke-tier coverage for BDD feature area: CSS Portability
// (CSS-COMPAT-001..010). File-presence + invariant checks keep CI fast;
// real cross-browser visual regression lives in Playwright (deferred).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const css = read("src/index.css");

describe("CSS portability (smoke)", () => {
  it("CSS-COMPAT-001: html disables iOS landscape text-size auto-zoom", () => {
    expect(css).toMatch(/-webkit-text-size-adjust:\s*100%/);
    expect(css).toMatch(/text-size-adjust:\s*100%/);
  });

  it("CSS-COMPAT-002: body kills the iOS blue tap-highlight flash", () => {
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
  });

  it("CSS-COMPAT-003: html sets scroll-padding-top so anchors clear sticky headers", () => {
    expect(css).toMatch(/scroll-padding-top:\s*5rem/);
  });

  it("CSS-COMPAT-004: dvh fallback is provided via @supports for iOS Safari < 15.4", () => {
    expect(css).toMatch(/@supports not \(height: 100dvh\)/);
    expect(css).toMatch(/\.h-dvh\s*{\s*height:\s*100vh/);
    expect(css).toMatch(/\.min-h-dvh\s*{\s*min-height:\s*100vh/);
  });

  it("CSS-COMPAT-005: safe-area utilities are registered", () => {
    expect(css).toMatch(/\.pt-safe\s*{\s*padding-top:\s*max\(env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.pb-safe\s*{\s*padding-bottom:\s*max\(env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.pl-safe\s*{/);
    expect(css).toMatch(/\.pr-safe\s*{/);
  });

  it("CSS-COMPAT-006: 100vh/h-screen are eradicated from src (use 100dvh / h-dvh / min-h-dvh)", () => {
    // Allow inside the @supports fallback block in index.css only.
    let hits: string[] = [];
    try {
      const out = execSync(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        `rg -l --no-heading -g '!node_modules' -g '!dist' -g '!*.test.*' -g '!src/index.css' -e '\\b100vh\\b' -e '\\bh-screen\\b' -e '\\bmin-h-screen\\b' -e '\\bmax-h-screen\\b' src`,
        { encoding: "utf8" },
      );
      hits = out.trim().split("\n").filter(Boolean);
    } catch {
      // rg exits 1 with no matches → portable codebase, expected.
    }
    expect(hits).toEqual([]);
  });

  it("CSS-COMPAT-007: every backdrop-blur usage is guarded with supports-[backdrop-filter]:", () => {
    let unguarded: string[] = [];
    try {
      const out = execSync(
        // grep lines with backdrop-blur but without the supports- guard on the same line
        `rg -n --no-heading -g '!node_modules' -g '!dist' -g '!*.test.*' 'backdrop-blur' src`,
        { encoding: "utf8" },
      );
      unguarded = out
        .split("\n")
        .filter(Boolean)
        .filter((line) => !line.includes("supports-[backdrop-filter]"));
    } catch {
      /* no matches */
    }
    expect(unguarded).toEqual([]);
  });

  it("CSS-COMPAT-008: shadcn primitives default to overscroll-contain", () => {
    expect(read("src/components/ui/scroll-area.tsx")).toMatch(/overscroll-contain/);
    expect(read("src/components/ui/dialog.tsx")).toMatch(/overscroll-contain/);
    expect(read("src/components/ui/sheet.tsx")).toMatch(/overscroll-contain/);
    expect(read("src/components/ui/drawer.tsx")).toMatch(/overscroll-contain/);
  });

  it("CSS-COMPAT-009: AppLayout sticky headers honor iOS notch", () => {
    const layout = read("src/components/AppLayout.tsx");
    const stickyHeaders = layout.match(/sticky top-0[^"]*"/g) ?? [];
    expect(stickyHeaders.length).toBeGreaterThan(0);
    for (const h of stickyHeaders) {
      expect(h, `header missing pt-safe: ${h}`).toMatch(/pt-safe/);
    }
  });

  it("CSS-COMPAT-010: Toast viewport + mobile nav honor iOS notch / home-indicator", () => {
    expect(read("src/components/ui/toast.tsx")).toMatch(/pt-safe[^"]*pb-safe/);
    expect(read("src/components/FlowMobileNav.tsx")).toMatch(/pt-safe/);
  });

  it("CSS-COMPAT-011: shadcn Table + Calendar primitives no longer rely on CSS :has()", () => {
    expect(read("src/components/ui/table.tsx")).not.toMatch(/:has\(/);
    expect(read("src/components/ui/table.tsx")).toMatch(/data-\[has-checkbox=true\]:pr-0/);
    expect(read("src/components/ui/calendar.tsx")).not.toMatch(/:has\(/);
  });

  it("CSS-COMPAT-012: bottom-fixed Fleety launcher clears the iPhone home indicator", () => {
    expect(read("src/components/FleetyChatWidget.tsx")).toMatch(/safe-area-inset-bottom/);
  });

  it("CSS-COMPAT-013: custom CSS in index.css uses logical padding (RTL-safe)", () => {
    const css = read("src/index.css");
    // .fleety-prose lists/items must use logical inline-start, not physical left.
    const proseBlock = css.slice(css.indexOf(".fleety-prose ul,"));
    expect(proseBlock).toMatch(/padding-inline-start:\s*1\.25rem/);
    expect(proseBlock).toMatch(/padding-inline-start:\s*0\.25rem/);
  });
});
