import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseSendAnnouncementEmailRequest, toPlainAnnouncementText } from "./validation.ts";

Deno.test("parseSendAnnouncementEmailRequest only accepts UUID announcement ids", () => {
  assertInstanceOf(parseSendAnnouncementEmailRequest(null), Response);
  assertInstanceOf(parseSendAnnouncementEmailRequest({ announcement_id: "" }), Response);
  assertInstanceOf(parseSendAnnouncementEmailRequest({ announcement_id: "../secrets" }), Response);
  assertInstanceOf(parseSendAnnouncementEmailRequest({ announcement_id: "123e4567-e89b-92d3-a456-426614174000" }), Response);

  const parsed = parseSendAnnouncementEmailRequest({ announcement_id: "123e4567-e89b-42d3-a456-426614174000" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.announcement_id, "123e4567-e89b-42d3-a456-426614174000");
});

Deno.test("toPlainAnnouncementText strips markup for Discord cross-posts", () => {
  const text = toPlainAnnouncementText("<h2>Hello</h2><p>Read&nbsp;<strong>this</strong> &amp; share.</p><script>alert(1)</script>");
  assertEquals(text.includes("<"), false);
  assertEquals(text.includes("&nbsp;"), false);
  assertEquals(text.includes("Hello"), true);
  assertEquals(text.includes("Read this & share."), true);
});
