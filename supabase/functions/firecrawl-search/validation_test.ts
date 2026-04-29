import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeFirecrawlResults, parseFirecrawlSearchRequest } from "./validation.ts";

Deno.test("parseFirecrawlSearchRequest validates query shape and clamps limit", () => {
  assertInstanceOf(parseFirecrawlSearchRequest(null), Response);
  assertInstanceOf(parseFirecrawlSearchRequest({ query: "a" }), Response);

  const parsed = parseFirecrawlSearchRequest({ query: "  accessibility\ntraining  ", limit: "99" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.query, "accessibility training");
  assertEquals(parsed.limit, 5);
});

Deno.test("normalizeFirecrawlResults strips unexpected fields and unsafe URLs", () => {
  const results = normalizeFirecrawlResults({
    data: [
      { title: "A\u0000Title", description: "Useful\nresult", url: "https://example.com/path", secret: "drop" },
      { title: "Bad", description: "Scheme", url: "javascript:alert(1)" },
    ],
  }, 5);

  assertEquals(results, [
    { title: "A Title", description: "Useful result", url: "https://example.com/path" },
    { title: "Bad", description: "Scheme", url: "" },
  ]);
});
