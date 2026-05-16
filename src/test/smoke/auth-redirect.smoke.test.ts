import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const authContext = read("src/contexts/AuthContext.tsx");
const main = read("src/main.tsx");
const app = read("src/App.tsx");
const redirectHandler = read("src/components/AuthRedirectHandler.tsx");
const projectDetail = read("src/pages/ProjectOpeningDetailPage.tsx");

describe("Authentication redirects (smoke)", () => {
  it("AUTH-REDIRECT-001: shared project apply flow does not use hard reload redirects", () => {
    expect(projectDetail).toContain("/login?redirect=");
    expect(projectDetail).not.toContain("sessionStorage.setItem(\"auth_redirect\", applicationPath)");
    expect(authContext).not.toContain("window.location.replace(storedRedirect)");
  });

  it("AUTH-REDIRECT-002: auth waits for getSession before INITIAL_SESSION can release protected routes", () => {
    expect(authContext).toContain("sessionRestoreSettledRef");
    expect(authContext).toContain("_event === \"INITIAL_SESSION\"");
    expect(authContext).toContain("!sessionRestoreSettledRef.current");
  });

  it("AUTH-REDIRECT-003: stored OAuth redirect is consumed through router navigation", () => {
    expect(app).toContain("<AuthRedirectHandler />");
    expect(redirectHandler).toContain("normalizeSafeRedirectTarget");
    expect(redirectHandler).toContain("navigate(target, { replace: true })");
  });

  it("AUTH-REDIRECT-004: startup cache reset does not reload Firefox repeatedly", () => {
    expect(main).toContain("clearAppCachesForVersion({ reloadAfterClear: false })");
  });
});