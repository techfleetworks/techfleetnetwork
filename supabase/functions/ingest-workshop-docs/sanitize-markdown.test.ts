// Coverage for ingest-workshop-docs' sanitizeMarkdown. The handler strips active
// HTML from admin-supplied markdown before it is embedded into Fleety's prompt,
// via the shared stripActiveContent owner (index.ts) instead of the old
// per-function tag regexes CodeQL flagged (js/incomplete-multi-character-sanitization,
// js/bad-tag-filter). This pins the contract sanitizeMarkdown relies on: active
// vectors are removed, benign markdown is preserved.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripActiveContent } from "../_shared/html-to-text.ts";

Deno.test("ingest-workshop-docs: sanitizeMarkdown removes script/iframe but keeps markdown", () => {
  const cleaned = stripActiveContent(
    "## Module 3\n<script>fetch('/steal')</script>\n- point **one**"
  );
  assertEquals(/<script|fetch\('\/steal'\)/i.test(cleaned), false);
  assertStringIncludes(cleaned, "## Module 3");
  assertStringIncludes(cleaned, "**one**");
});

Deno.test("ingest-workshop-docs: nested tag reconstruction cannot survive", () => {
  assertEquals(/<script/i.test(stripActiveContent("<scr<script>ipt>x</scr</script>ipt>")), false);
});
