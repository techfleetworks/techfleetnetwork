import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Public route lightweight loading coverage", () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  const landingSource = fs.readFileSync(path.join(process.cwd(), "src", "pages", "LandingPage.tsx"), "utf8");
  const authenticatedShellSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "layout", "AuthenticatedShell.tsx"), "utf8");
  const adminShellSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "layout", "AdminShell.tsx"), "utf8");
  const publicShellSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "layout", "PublicShell.tsx"), "utf8");

  it("PERF-PUBLIC-ROUTE-SHELL-036: lazy-loads auth and not-found routes", () => {
    expect(appSource).toContain('const LoginPage = lazy(() => import("./pages/LoginPage"));');
    expect(appSource).toContain('const RegisterPage = lazy(() => import("./pages/RegisterPage"));');
    expect(appSource).toContain('const NotFound = lazy(() => import("./pages/NotFound"));');
    expect(appSource).not.toContain('import LoginPage from "./pages/LoginPage"');
    expect(appSource).not.toContain('import RegisterPage from "./pages/RegisterPage"');
    expect(appSource).not.toContain('import NotFound from "./pages/NotFound"');
  });

  it("PERF-PUBLIC-ROUTE-SHELL-036: wraps public routes in PublicShell", () => {
    expect(appSource).toContain('<Route element={<PublicShell />}>');
    expect(appSource).toContain('<Route path="/" element={<Index />} />');
    expect(appSource).toContain('<Route path="/login" element={<LoginPage />} />');
    expect(appSource).toContain('<Route path="/register" element={<RegisterPage />} />');
    expect(publicShellSource).not.toContain("IdleTimeoutGuard");
    expect(publicShellSource).not.toContain("SelfHealingRunner");
    expect(publicShellSource).not.toContain("AppLayout");
  });

  it("PERF-AUTH-SERVICE-ISOLATION-037: keeps authenticated-only services inside auth/admin shells", () => {
    expect(appSource).not.toContain("<AppLayout>");
    expect(appSource).not.toContain("<IdleTimeoutGuard />");
    expect(appSource).not.toContain("<SelfHealingRunner />");
    expect(authenticatedShellSource).toContain("<AppLayout>");
    expect(authenticatedShellSource).toContain("<IdleTimeoutGuard />");
    expect(authenticatedShellSource).toContain("<SelfHealingRunner />");
    expect(adminShellSource).toContain("<AppLayout>");
    expect(adminShellSource).toContain("<IdleTimeoutGuard />");
    expect(adminShellSource).toContain("<SelfHealingRunner />");
  });

  it("PERF-DEFERRED-NETWORK-ACTIVITY-038: defers NetworkActivity below the landing fold", () => {
    expect(landingSource).toContain('import { DeferredSection } from "@/components/DeferredSection";');
    expect(landingSource).toContain("<DeferredSection");
    expect(landingSource).toContain("minHeight={800}");
    expect(landingSource).toContain("<NetworkActivity />");
  });
});