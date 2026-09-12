// Security regression: the single HTML → text owner must defeat the bypasses
// that CodeQL flagged in the hand-rolled per-handler strippers
// (js/incomplete-multi-character-sanitization, js/bad-tag-filter,
// js/double-escaping). Mirrors @security scenarios in
// supabase/functions/_shared/html-to-text.feature.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { htmlToPlainText, stripActiveContent } from "./html-to-text.ts";

Deno.test("htmlToPlainText: strips simple tags to text", () => {
  assertEquals(htmlToPlainText("<p>Hello <strong>world</strong></p>"), "Hello world");
});

Deno.test("htmlToPlainText: nested reconstruction cannot survive (fixpoint)", () => {
  // A single pass would leave a live <script>; the fixpoint removes it.
  const out = htmlToPlainText("<scr<script>ipt>alert(1)</scr</script>ipt>");
  assertEquals(/<script|<\/script/i.test(out), false);
});

Deno.test("htmlToPlainText: `>` inside an attribute does not break tag removal", () => {
  const out = htmlToPlainText(`<a title="a > b" href="x">link</a>`);
  assertEquals(out.includes("<"), false);
  assertStringIncludes(out, "link");
});

Deno.test("htmlToPlainText: no double-unescape (&amp;lt; stays literal)", () => {
  // &amp;lt; must decode to the literal text "&lt;", never to "<".
  assertEquals(htmlToPlainText("5 &amp;lt; 10"), "5 &lt; 10");
});

Deno.test("htmlToPlainText: decodes common entities", () => {
  assertEquals(htmlToPlainText("Tom&nbsp;&amp;&nbsp;Jerry"), "Tom & Jerry");
});

Deno.test("htmlToPlainText: script/style bodies are dropped, not leaked as text", () => {
  const out = htmlToPlainText("<style>.x{color:red}</style><p>Hi</p><script>steal()</script>");
  assertEquals(out.includes("color:red"), false);
  assertEquals(out.includes("steal()"), false);
  assertStringIncludes(out, "Hi");
});

Deno.test("htmlToPlainText: preserveLineBreaks keeps paragraph/list structure", () => {
  const out = htmlToPlainText("<p>One</p><ul><li>a</li><li>b</li></ul>", {
    preserveLineBreaks: true,
  });
  assertStringIncludes(out, "One");
  assertStringIncludes(out, "• a");
  assertStringIncludes(out, "• b");
});

Deno.test("htmlToPlainText: empty / nullish input -> empty string", () => {
  assertEquals(htmlToPlainText(""), "");
  assertEquals(htmlToPlainText(null), "");
  assertEquals(htmlToPlainText(undefined), "");
});

Deno.test("stripActiveContent: removes script but preserves benign markup/markdown", () => {
  const out = stripActiveContent("# Heading\n<script>alert(1)</script>\n**bold** and <b>x</b>");
  assertEquals(/alert\(1\)|<script/i.test(out), false);
  assertStringIncludes(out, "# Heading");
  assertStringIncludes(out, "**bold**");
});

Deno.test("stripActiveContent: neutralizes event handlers and javascript: URLs", () => {
  const out = stripActiveContent(`<a href="javascript:alert(1)" onclick="x()">y</a>`);
  assertEquals(/javascript:/i.test(out), false);
  assertEquals(/onclick/i.test(out), false);
});

Deno.test("stripActiveContent: split-scheme reconstruction cannot survive", () => {
  const out = stripActiveContent("javasjavascript:cript:alert(1)");
  assertEquals(/javascript:/i.test(out), false);
});
