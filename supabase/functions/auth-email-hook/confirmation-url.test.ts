// Coverage for supabase/functions/auth-email-hook (ADR-0064): the confirmation
// URL builder used by the auth-email-hook entrypoint.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConfirmationUrl } from "./confirmation-url.ts";

// ADR-0064 structural guard: signup/invite/magiclink confirmation links MUST
// land on the inert /auth/confirm app page — NEVER the single-use GoTrue
// /auth/v1/verify GET that a link scanner/prefetch can consume before the human
// clicks. If someone reroutes them back to the verify GET, these go red.
const CFG = {
  appOrigin: "https://techfleet.network",
  allowedOrigins: new Set(["https://techfleet.network", "https://www.techfleet.network"]),
  supabaseUrl: "https://proj.supabase.co",
};

for (const type of ["signup", "invite", "magiclink"]) {
  Deno.test(`${type}: inert /auth/confirm landing, never /auth/v1/verify`, () => {
    const url = buildConfirmationUrl(type, "hash-123", "https://techfleet.network/", CFG);
    const u = new URL(url);
    assertEquals(u.origin, "https://techfleet.network");
    assertEquals(u.pathname, "/auth/confirm");
    assertEquals(u.searchParams.get("token_hash"), "hash-123");
    assertEquals(u.searchParams.get("type"), type);
    assert(!url.includes("/auth/v1/verify"), `${type} must not use the single-use verify GET`);
  });
}

Deno.test("recovery keeps its inert /reset-password/confirm landing", () => {
  const url = buildConfirmationUrl(
    "recovery",
    "hash-r",
    "https://techfleet.network/reset-password",
    CFG
  );
  const u = new URL(url);
  assertEquals(u.pathname, "/reset-password/confirm");
  assertEquals(u.searchParams.get("type"), "recovery");
  assert(!url.includes("/auth/v1/verify"));
});

Deno.test("email_change stays on the verify GET (deferred — ADR-0064 Scope)", () => {
  const url = buildConfirmationUrl("email_change", "hash-e", "https://techfleet.network/", CFG);
  assert(
    url.includes("/auth/v1/verify"),
    "email_change is intentionally still on verify until rerouted"
  );
});

Deno.test("missing token_hash falls back to the verify GET (no broken inert link)", () => {
  const url = buildConfirmationUrl("signup", "", "https://techfleet.network/", CFG);
  assert(url.includes("/auth/v1/verify"));
});

Deno.test("off-allowlist redirect origin falls back to APP_ORIGIN", () => {
  const url = buildConfirmationUrl("signup", "h", "https://evil.example.com/", CFG);
  const u = new URL(url);
  assertEquals(u.origin, "https://techfleet.network");
  assertEquals(u.pathname, "/auth/confirm");
});
