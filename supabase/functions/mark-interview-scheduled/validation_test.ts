import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, parseMarkInterviewScheduledRequest, toSafeNotificationText } from "./validation.ts";

Deno.test("parseMarkInterviewScheduledRequest only accepts valid UUID application ids", () => {
  assertInstanceOf(parseMarkInterviewScheduledRequest(null), Response);
  assertInstanceOf(parseMarkInterviewScheduledRequest([]), Response);
  assertInstanceOf(parseMarkInterviewScheduledRequest({ application_id: "" }), Response);
  assertInstanceOf(parseMarkInterviewScheduledRequest({ application_id: "../project_applications" }), Response);
  assertInstanceOf(parseMarkInterviewScheduledRequest({ application_id: "123e4567-e89b-92d3-a456-426614174000" }), Response);

  const parsed = parseMarkInterviewScheduledRequest({ application_id: "123E4567-E89B-42D3-A456-426614174000" });
  assertEquals(parsed instanceof Response, false);
  if (parsed instanceof Response) return;
  assertEquals(parsed.application_id, "123e4567-e89b-42d3-a456-426614174000");
});

Deno.test("notification text helpers strip control characters and escape HTML", () => {
  assertEquals(toSafeNotificationText(" Jane\n<script>alert(1)</script> ", "Applicant"), "Jane <script>alert(1)</script>");
  assertEquals(escapeHtml("Jane <Admin> & 'Client'"), "Jane &lt;Admin&gt; &amp; &#39;Client&#39;");
  assertEquals(toSafeNotificationText("\u0000\u0007", "Applicant"), "Applicant");
});
