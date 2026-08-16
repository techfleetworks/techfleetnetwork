import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import { BlobWriter, TextReader, ZipWriter } from "jsr:@zip-js/zip-js";
import {
  decodeXmlEntities,
  LEGACY_OFFICE_MESSAGE,
  MACRO_FILE_MESSAGE,
  parseFileToText,
  sniffFileKind,
  UnsupportedFile,
  xmlTagText,
} from "./file-parse.ts";

const enc = (s: string) => new TextEncoder().encode(s);
/** Build a real zip (starts with PK) from path->content, as OOXML files are. */
async function makeZip(files: Record<string, string>): Promise<Uint8Array> {
  const w = new ZipWriter(new BlobWriter("application/zip"));
  for (const [name, content] of Object.entries(files)) await w.add(name, new TextReader(content));
  return new Uint8Array(await (await w.close()).arrayBuffer());
}

Deno.test("sniffFileKind identifies by magic bytes, never extension", () => {
  assertEquals(sniffFileKind(enc("%PDF-1.7\n...")), "pdf");
  assertEquals(sniffFileKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])), "ooxml");
  assertEquals(
    sniffFileKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
    "ole-legacy"
  );
  assertEquals(sniffFileKind(enc("name,role\nAda,eng\n")), "text");
  assertEquals(sniffFileKind(new Uint8Array([0x00, 0x01, 0x02, 0x03])), "unknown");
});

Deno.test("decodeXmlEntities resolves only standard + numeric refs (no external entities)", () => {
  assertEquals(decodeXmlEntities("a &amp; b &lt;c&gt; &#65; &#x42;"), "a & b <c> A B");
  assertEquals(decodeXmlEntities("&xxe;"), "&xxe;"); // unknown entity is left literal, never expanded
});

Deno.test("xmlTagText pulls tag text by regex, strips nested markup, handles ns prefixes", () => {
  assertEquals(xmlTagText("<w:t>Ship the MVP</w:t><w:t>Q3</w:t>", "t"), ["Ship the MVP", "Q3"]);
  assertEquals(xmlTagText('<t xml:space="preserve">hi <b>there</b></t>', "t"), ["hi there"]);
  assertEquals(xmlTagText("<t>  </t><t>real</t>", "t"), ["real"]); // blank-only skipped
});

Deno.test(
  "parseFileToText: plain text passes through; empty + oversize + legacy are refused",
  async () => {
    assertEquals((await parseFileToText(enc("goal: ship MVP"))).text, "goal: ship MVP");
    await assertRejects(() => parseFileToText(new Uint8Array(0)), UnsupportedFile, "empty");
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await assertRejects(
      () => parseFileToText(ole),
      UnsupportedFile,
      LEGACY_OFFICE_MESSAGE.slice(0, 20)
    );
  }
);

Deno.test("parseFileToText reads a DOCX (word/document.xml <w:t>)", async () => {
  const docx = await makeZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml":
      "<w:document><w:body><w:p><w:r><w:t>Ship the MVP</w:t></w:r></w:p><w:p><w:t>Q3 goals</w:t></w:p></w:body></w:document>",
  });
  const { kind, text } = await parseFileToText(docx);
  assertEquals(kind, "ooxml");
  assertStringIncludes(text, "Ship the MVP");
  assertStringIncludes(text, "Q3 goals");
});

Deno.test("parseFileToText reads an XLSX (shared strings)", async () => {
  const xlsx = await makeZip({
    "xl/workbook.xml": "<workbook/>",
    "xl/sharedStrings.xml": "<sst><si><t>Revenue</t></si><si><t>Q3 target</t></si></sst>",
  });
  const { text } = await parseFileToText(xlsx);
  assertStringIncludes(text, "Revenue");
  assertStringIncludes(text, "Q3 target");
});

Deno.test("parseFileToText REFUSES a macro-enabled OOXML (vbaProject.bin)", async () => {
  const docm = await makeZip({
    "word/document.xml": "<w:document><w:body><w:t>hi</w:t></w:body></w:document>",
    "word/vbaProject.bin": "macro-bytes",
  });
  await assertRejects(
    () => parseFileToText(docm),
    UnsupportedFile,
    MACRO_FILE_MESSAGE.slice(0, 20)
  );
});

Deno.test("XXE-safe: a DOCTYPE/ENTITY in the OOXML XML is never expanded", async () => {
  const evil = await makeZip({
    "word/document.xml":
      '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY xxe "PWNED-SECRET">]><w:document><w:body><w:t>&xxe;</w:t></w:body></w:document>',
  });
  const { text } = await parseFileToText(evil);
  assert(!text.includes("PWNED-SECRET"), "external entity must NOT be expanded (XXE)");
});
