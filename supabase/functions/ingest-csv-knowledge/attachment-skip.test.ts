// Coverage for ingest-csv-knowledge's attachment-skip decision. The handler skips
// Airtable attachment cells by host (index.ts uses isAirtableAttachmentUrl)
// instead of the old `.includes("airtableusercontent.com")` substring test CodeQL
// flagged (js/incomplete-url-substring-sanitization). This pins that contract.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAirtableAttachmentUrl } from "../_shared/url-host.ts";

Deno.test("ingest-csv-knowledge: attachment cells are skipped (classified as attachment)", () => {
  assertEquals(isAirtableAttachmentUrl("https://v5.airtableusercontent.com/x/img.png"), true);
});

Deno.test("ingest-csv-knowledge: substantive knowledge text is kept (not an attachment)", () => {
  assertEquals(isAirtableAttachmentUrl("A definition of the term goes here."), false);
});

Deno.test("ingest-csv-knowledge: a URL that merely mentions the host in its path is kept", () => {
  assertEquals(isAirtableAttachmentUrl("https://example.com/airtableusercontent.com/notes"), false);
});
