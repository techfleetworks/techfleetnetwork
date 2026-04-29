import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractBearerToken } from "./admin-client.ts";

Deno.test("extractBearerToken denies missing or malformed authorization headers", () => {
  assertEquals(extractBearerToken(new Request("https://example.test")), null);
  assertEquals(
    extractBearerToken(
      new Request("https://example.test", {
        headers: { Authorization: "Basic abc" },
      }),
    ),
    null,
  );
  assertEquals(
    extractBearerToken(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer   " },
      }),
    ),
    null,
  );
});

Deno.test("extractBearerToken accepts only explicit bearer tokens", () => {
  assertEquals(
    extractBearerToken(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer abc.def.ghi" },
      }),
    ),
    "abc.def.ghi",
  );
});
