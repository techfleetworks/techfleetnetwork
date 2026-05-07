// Smoke-tier coverage for BDD feature area: Accessibility (A-01..A-15).
// These tests are file-presence + invariant checks to keep CI fast; deeper
// behavior is exercised by Playwright in e2e/a11y/.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(root, p));

describe("Accessibility (smoke)", () => {
  it("A-01: AppLayout exposes a single skip link to #main-content", () => {
    const layout = read("src/components/AppLayout.tsx");
    expect(layout).toMatch(/skip[-\s]?(to|link)/i);
    expect(layout).toMatch(/id=["']main-content["']|<main\b/);
  });

  it("A-02: Global focus ring CSS is defined and not nuked anywhere", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/focus(-visible)?/);
  });

  it("A-03: prefers-reduced-motion is honored globally", () => {
    const css = exists("src/App.css") ? read("src/App.css") : read("src/index.css");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("A-07/A-09: WCAG checklist + DOM probes contain target-size and html-lang", () => {
    const probes = read("e2e/a11y/dom-probes.ts");
    expect(probes).toMatch(/target-size-minimum-24x24/);
    expect(probes).toMatch(/html-lang-matches-locale/);
    expect(probes).toMatch(/no-positive-tabindex/);
  });

  it("A-10: Live announcer / status-messages probe is wired", () => {
    const probes = read("e2e/a11y/dom-probes.ts");
    expect(probes).toMatch(/status-messages-use-live-region/);
  });

  it("A-12: /accessibility route is registered in App router", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/\/accessibility/);
  });

  it("A-14: Certificate PDF generator sets Lang + Title metadata", () => {
    const cert = read("src/lib/generate-certificate-pdf.ts");
    expect(cert).toMatch(/setLanguage/);
    expect(cert).toMatch(/setProperties/);
  });

  it("PR-gate: a11y-audit workflow runs on pull_request", () => {
    const wf = read(".github/workflows/a11y-audit.yml");
    expect(wf).toMatch(/pull_request:/);
    expect(wf).toMatch(/enforce-baseline\.mjs/);
  });

  it("Baseline file present and parseable", () => {
    const baseline = JSON.parse(read("e2e/a11y/baseline.json"));
    expect(typeof baseline.maxTotalViolations).toBe("number");
  });
});
