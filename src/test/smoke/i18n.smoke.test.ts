// Smoke-tier coverage for BDD feature area: Accessibility i18n (A-16..A-20).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(root, p));

describe("Accessibility i18n (smoke)", () => {
  it("A-16: i18n bootstrap updates <html lang> + dir on languageChanged", () => {
    const i18n = read("src/i18n/index.ts");
    expect(i18n).toMatch(/document\.documentElement\.lang/);
    expect(i18n).toMatch(/document\.documentElement\.dir/);
    expect(i18n).toMatch(/languageChanged/);
  });

  it("A-17: RTL languages set is exported and includes ar/he/fa/ur", () => {
    const i18n = read("src/i18n/index.ts");
    expect(i18n).toMatch(/RTL_LANGS/);
    for (const lng of ["ar", "he", "fa", "ur"]) {
      expect(i18n).toContain(`"${lng}"`);
    }
  });

  it("A-18: ensureLocale falls back to translate-bundle edge function", () => {
    const i18n = read("src/i18n/index.ts");
    expect(i18n).toMatch(/translate-bundle/);
    expect(i18n).toMatch(/i18n\.addResourceBundle/);
  });

  it("A-19: translate-bundle edge function is present", () => {
    expect(exists("supabase/functions/translate-bundle/index.ts")).toBe(true);
  });

  it("A-20: Locale-aware formatDate util exists and uses Intl", () => {
    expect(exists("src/lib/i18n-format.ts")).toBe(true);
    const fmt = read("src/lib/i18n-format.ts");
    expect(fmt).toMatch(/Intl\.DateTimeFormat/);
    expect(fmt).toMatch(/Intl\.NumberFormat/);
  });

  it("English bundle ships with at least one key for parity checks", () => {
    const en = JSON.parse(read("src/i18n/locales/en/common.json"));
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });
});
