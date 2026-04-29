import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jsonResponse, parseJsonBody } from "./http.ts";

Deno.test("jsonResponse applies OWASP AJAX-safe JSON headers", () => {
  const response = jsonResponse({ ok: true });

  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(response.headers.get("cache-control"), "no-store, max-age=0");
  assertEquals(response.headers.get("pragma"), "no-cache");
  assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  assertEquals(response.headers.get("vary"), "Origin");
});

Deno.test("jsonResponse fails closed on invalid status codes", () => {
  assertEquals(jsonResponse({ ok: false }, 999).status, 500);
  assertEquals(jsonResponse({ ok: false }, 0).status, 500);
});

Deno.test("parseJsonBody rejects oversized bodies before parsing", async () => {
  const req = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": "20", "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });

  try {
    await parseJsonBody(req, 4);
    throw new Error("Expected parseJsonBody to reject oversized body");
  } catch (error) {
    assertEquals(error instanceof Response, true);
    assertEquals((error as Response).status, 413);
  }
});
