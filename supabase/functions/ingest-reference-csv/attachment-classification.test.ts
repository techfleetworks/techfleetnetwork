// Coverage for ingest-reference-csv's attachment classification. The handler
// counts/keeps Airtable attachment cells by host (index.ts uses
// isAirtableAttachmentUrl) instead of the old `.includes("airtableusercontent.com")`
// substring test that CodeQL flagged (js/incomplete-url-substring-sanitization).
// This pins the contract that classification relies on.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAirtableAttachmentUrl } from "../_shared/url-host.ts";

Deno.test(
  "ingest-reference-csv: real Airtable attachment cells are classified as attachments",
  () => {
    assertEquals(
      isAirtableAttachmentUrl("https://v5.airtableusercontent.com/abc/report.pdf"),
      true
    );
  }
);

Deno.test("ingest-reference-csv: ordinary cell text is NOT an attachment", () => {
  assertEquals(isAirtableAttachmentUrl("Quarterly report, see attached"), false);
});

Deno.test(
  "ingest-reference-csv: a look-alike host is NOT treated as an attachment (no substring bypass)",
  () => {
    assertEquals(isAirtableAttachmentUrl("https://airtableusercontent.com.attacker.test/x"), false);
  }
);
