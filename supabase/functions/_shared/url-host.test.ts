// Security regression for the shared hostname classifier that replaced the
// substring host checks CodeQL flagged (js/incomplete-url-substring-sanitization).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { urlHostnameEndsWith, hostnameOf, isAirtableAttachmentUrl } from "./url-host.ts";

Deno.test("urlHostnameEndsWith: exact host and subdomains match", () => {
  assertEquals(
    urlHostnameEndsWith("https://airtableusercontent.com/x", "airtableusercontent.com"),
    true
  );
  assertEquals(
    urlHostnameEndsWith("https://v5.airtableusercontent.com/x", "airtableusercontent.com"),
    true
  );
});

Deno.test("urlHostnameEndsWith: a look-alike host does NOT match (the substring bypass)", () => {
  // `.includes("airtableusercontent.com")` would wrongly match both of these.
  assertEquals(
    urlHostnameEndsWith(
      "https://evil-airtableusercontent.com.attacker.test/x",
      "airtableusercontent.com"
    ),
    false
  );
  assertEquals(
    urlHostnameEndsWith(
      "https://attacker.test/?u=airtableusercontent.com",
      "airtableusercontent.com"
    ),
    false
  );
});

Deno.test("hostnameOf: non-URL input returns null", () => {
  assertEquals(hostnameOf("not a url"), null);
  assertEquals(hostnameOf("just some cell text"), null);
});

Deno.test("isAirtableAttachmentUrl: real attachment host vs plain text", () => {
  assertEquals(isAirtableAttachmentUrl("https://v5.airtableusercontent.com/abc/file.png"), true);
  assertEquals(isAirtableAttachmentUrl("a normal description with no url"), false);
  assertEquals(isAirtableAttachmentUrl("https://example.com/airtableusercontent.com"), false);
});
