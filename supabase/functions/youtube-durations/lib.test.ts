// Deno unit tests for the youtube-durations pure helpers. Run:
//   deno test supabase/functions/youtube-durations/lib.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { iso8601ToSeconds, parseIds, durationsFromResponse, MAX_IDS } from "./lib.ts";

Deno.test("iso8601ToSeconds parses H/M/S shapes", () => {
  assertEquals(iso8601ToSeconds("PT8M30S"), 510);
  assertEquals(iso8601ToSeconds("PT1H2M5S"), 3725);
  assertEquals(iso8601ToSeconds("PT45S"), 45);
  assertEquals(iso8601ToSeconds("PT12M"), 720);
});

Deno.test("iso8601ToSeconds rejects junk (null, not a string, bare PT)", () => {
  assertEquals(iso8601ToSeconds("8:30"), null);
  assertEquals(iso8601ToSeconds("PT"), null);
  assertEquals(iso8601ToSeconds(""), null);
  assertEquals(iso8601ToSeconds(undefined), null);
  assertEquals(iso8601ToSeconds(510), null);
});

Deno.test("parseIds keeps only well-formed 11-char ids, dedupes, and caps", () => {
  assertEquals(parseIds("iOHQRwqSvyE, 2iobd4EyJas"), ["iOHQRwqSvyE", "2iobd4EyJas"]);
  // junk / wrong length / injection attempts are dropped
  assertEquals(parseIds("short, ../etc/passwd, <script>, iOHQRwqSvyE"), ["iOHQRwqSvyE"]);
  // dedupe
  assertEquals(parseIds("iOHQRwqSvyE,iOHQRwqSvyE"), ["iOHQRwqSvyE"]);
  // empty / null
  assertEquals(parseIds(""), []);
  assertEquals(parseIds(null), []);
  // cap
  const many = Array.from({ length: MAX_IDS + 10 }, (_, i) => `abcdefgh${String(i).padStart(3, "0")}`);
  assertEquals(parseIds(many.join(",")).length, MAX_IDS);
});

Deno.test("durationsFromResponse maps valid items, skips bad ids/durations", () => {
  const body = {
    items: [
      { id: "iOHQRwqSvyE", contentDetails: { duration: "PT8M30S" } },
      { id: "2iobd4EyJas", contentDetails: { duration: "PT45S" } },
      { id: "bad", contentDetails: { duration: "PT1M" } }, // id not 11 chars → skipped
      { id: "xkX9Mxt_688", contentDetails: { duration: "nope" } }, // unparseable → skipped
    ],
  };
  assertEquals(durationsFromResponse(body), { iOHQRwqSvyE: 510, "2iobd4EyJas": 45 });
  assertEquals(durationsFromResponse(null), {});
  assertEquals(durationsFromResponse({}), {});
});
