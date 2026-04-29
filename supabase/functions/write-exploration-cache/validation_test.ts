import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseExplorationCachePayload } from "./validation.ts";

Deno.test("parseExplorationCachePayload rejects malformed and oversized cache writes", async () => {
  assertInstanceOf(parseExplorationCachePayload(null), Response);
  assertInstanceOf(parseExplorationCachePayload({ query_normalized: "", response_markdown: "ok" }), Response);
  assertInstanceOf(parseExplorationCachePayload({ query_normalized: "<script>alert(1)</script>", response_markdown: "ok" }), Response);
  assertEquals((parseExplorationCachePayload({ query_normalized: "safe", response_markdown: "x".repeat(32_769) }) as Response).status, 413);
});

Deno.test("parseExplorationCachePayload redacts sensitive output before cache storage", () => {
  const parsed = parseExplorationCachePayload({
    query_normalized: "portfolio review",
    response_markdown: "Email jane@example.com and token Bearer abcdefghijklmnop1234567890 with id 123e4567-e89b-12d3-a456-426614174000",
  });

  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.query_normalized, "portfolio review");
  assertEquals(parsed.response_markdown.includes("jane@example.com"), false);
  assertEquals(parsed.response_markdown.includes("abcdefghijklmnop1234567890"), false);
  assertEquals(parsed.response_markdown.includes("123e4567-e89b-12d3-a456-426614174000"), false);
  assertEquals(parsed.response_markdown.includes("[redacted-email]"), true);
  assertEquals(parsed.response_markdown.includes("[redacted-id]"), true);
});