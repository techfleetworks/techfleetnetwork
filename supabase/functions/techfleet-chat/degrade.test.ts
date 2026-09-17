import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDegradeMarkdown } from "./degrade.ts";

Deno.test(
  "buildDegradeMarkdown: always offers the standing fallbacks, even with no sources",
  () => {
    const md = buildDegradeMarkdown([]);
    assertStringIncludes(md, "search bar");
    assertStringIncludes(md, "Knowledge Base");
    assertStringIncludes(md, "office hours");
    // With no sources there must be no bullet list (no empty "Knowledge Base pages" header dangling).
    assert(!md.includes("- "), "no source bullets when there are no sources");
    assert(!md.includes("related to your question"), "no sources header when there are no sources");
  }
);

Deno.test("buildDegradeMarkdown: lists the real retrieved KB links as bullets", () => {
  const md = buildDegradeMarkdown(["https://kb.techfleet.org/a", "https://kb.techfleet.org/b"]);
  assertStringIncludes(md, "- https://kb.techfleet.org/a");
  assertStringIncludes(md, "- https://kb.techfleet.org/b");
  assertStringIncludes(md, "related to your question");
});

Deno.test("buildDegradeMarkdown: never emits a non-http(s) link (no unsafe schemes)", () => {
  const md = buildDegradeMarkdown(["javascript:alert(1)", "https://ok.example/x"]);
  assert(!md.includes("javascript:"), "non-http scheme is filtered out");
  assertStringIncludes(md, "- https://ok.example/x");
});

Deno.test("buildDegradeMarkdown: never fabricates a substantive answer", () => {
  // The degrade copy must read as 'I can't answer right now', not as an answer.
  const md = buildDegradeMarkdown([]);
  assertStringIncludes(md, "can't put together a full answer");
});
