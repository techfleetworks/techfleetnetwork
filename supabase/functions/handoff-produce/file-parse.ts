// Secure multi-format file parsing for hand-off ingest (ADR-0006 §4/§5). Deterministic CODE, never
// an LLM. Runs in the Deno edge sandbox (no shell, no eval, no fs writes). Turns an uploaded file's
// bytes into plain text for the extractor, hardened against the OWASP file-upload threats:
//   - type by MAGIC BYTES (never the extension or Content-Type)
//   - zip DECOMPRESSION-BOMB caps (entry count + total uncompressed size) for OOXML
//   - NO XXE: OOXML text is pulled by REGEX from the XML, never a DTD/entity-processing parser, and
//     entity decoding resolves only the 5 standard + numeric refs (never external entities)
//   - legacy OLE (.doc/.xls) + macro-enabled (.docm/.xlsm) are REFUSED with a helpful message
//   - overall size cap + output-length cap; fail-closed (throws UnsupportedFile with a user message)
import { extractText, getDocumentProxy } from "npm:unpdf";
import { BlobReader, configure, TextWriter, ZipReader } from "jsr:@zip-js/zip-js";

// Edge runtime has no web workers; run zip.js inline so it works in the Deno edge sandbox.
configure({ useWebWorkers: false });

export const MAX_FILE_BYTES = 52_428_800; // 50 MB (matches the bucket + intake cap)
const MAX_ZIP_ENTRIES = 4_096; // real OOXML files have far fewer; a huge count is a bomb signal
const MAX_ZIP_UNCOMPRESSED = 40_000_000; // 40 MB total across entries (decompression-bomb guard)
const MAX_TEXT_OUT = 2_000_000; // cap the text we return (memory + cost bound)

export type FileKind = "pdf" | "ooxml" | "ole-legacy" | "text" | "unknown";

export const LEGACY_OFFICE_MESSAGE =
  "This looks like an older Word or Excel file (.doc or .xls). Those aren't supported. Please save it as a PDF, or as a newer .docx, .xlsx, or .csv, then upload again.";
export const MACRO_FILE_MESSAGE =
  "Files with macros (.docm, .xlsm) aren't supported. Please save a copy without macros as .docx, .xlsx, PDF, or .csv, then upload again.";

/** A file we identified but will not parse — carries a user-facing reason. */
export class UnsupportedFile extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFile";
  }
}

function startsWith(b: Uint8Array, sig: number[], off = 0): boolean {
  if (b.length < off + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[off + i] !== sig[i]) return false;
  return true;
}

/** True for strict UTF-8 with no binary control chars (CSV/TXT/MD have no magic bytes). */
export function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s);
  } catch {
    return false;
  }
}

/** PURE: identify a file by its MAGIC BYTES. Never trusts the extension or Content-Type. */
export function sniffFileKind(bytes: Uint8Array): FileKind {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "ooxml"; // PK.. (zip: docx/xlsx/...)
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole-legacy"; // .doc/.xls
  if (isUtf8Text(bytes)) return "text";
  return "unknown";
}

/** Decode ONLY the 5 standard XML entities + numeric char refs. No external-entity resolution (XXE). */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** PURE: pull inner text of every <tag>…</tag> (namespace-prefixed ok) by REGEX — never an XML/DTD
 *  parser, so there is no entity expansion and no XXE. Strips nested tags, decodes standard entities. */
export function xmlTagText(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    const inner = m[1].replace(/<[^>]*>/g, ""); // drop any nested markup
    const t = decodeXmlEntities(inner).trim();
    if (t) out.push(t);
  }
  return out;
}

/** Read the wanted OOXML entries with decompression-bomb caps. Detects macro projects. */
async function readOoxmlEntries(
  bytes: Uint8Array,
  wanted: (path: string) => boolean
): Promise<{ entries: Map<string, string>; hasMacro: boolean }> {
  const reader = new ZipReader(new BlobReader(new Blob([bytes as BlobPart])));
  const entries = new Map<string, string>();
  let hasMacro = false;
  try {
    const list = await reader.getEntries();
    if (list.length > MAX_ZIP_ENTRIES)
      throw new UnsupportedFile("this file has too many internal parts to open safely");
    let totalUncompressed = 0;
    for (const e of list) {
      totalUncompressed += (e as { uncompressedSize?: number }).uncompressedSize ?? 0;
      if (totalUncompressed > MAX_ZIP_UNCOMPRESSED)
        throw new UnsupportedFile("this file is too large when uncompressed");
      if (e.filename.endsWith("vbaProject.bin")) hasMacro = true;
    }
    if (hasMacro) return { entries, hasMacro }; // refuse before reading any data
    for (const e of list) {
      if (e.directory || typeof e.getData !== "function" || !wanted(e.filename)) continue;
      entries.set(e.filename, await e.getData(new TextWriter()));
    }
  } finally {
    await reader.close();
  }
  return { entries, hasMacro };
}

async function parseOoxml(bytes: Uint8Array): Promise<string> {
  const { entries, hasMacro } = await readOoxmlEntries(
    bytes,
    (p) =>
      p === "word/document.xml" ||
      p === "xl/sharedStrings.xml" ||
      (p.startsWith("xl/worksheets/") && p.endsWith(".xml"))
  );
  if (hasMacro) throw new UnsupportedFile(MACRO_FILE_MESSAGE);
  const docx = entries.get("word/document.xml");
  if (docx) return xmlTagText(docx, "t").join("\n").slice(0, MAX_TEXT_OUT); // DOCX: <w:t>
  const parts: string[] = [];
  const shared = entries.get("xl/sharedStrings.xml");
  if (shared) parts.push(...xmlTagText(shared, "t")); // XLSX shared strings
  for (const [path, xml] of entries)
    if (path.startsWith("xl/worksheets/")) parts.push(...xmlTagText(xml, "t")); // inline cell text
  if (parts.length) return parts.join("\n").slice(0, MAX_TEXT_OUT);
  throw new UnsupportedFile("this Office file has no readable text, or is an unsupported type");
}

async function parsePdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  // `text` is a string when mergePages is set, but keep it defensive across unpdf versions.
  const raw: unknown = (await extractText(pdf, { mergePages: true })).text;
  const merged =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
  return merged.slice(0, MAX_TEXT_OUT);
}

/**
 * Turn an uploaded file's bytes into plain text, chosen by MAGIC BYTES. Throws UnsupportedFile (with
 * a user-facing message) for legacy OLE, macro-enabled, or unrecognized files — the caller decides
 * whether to surface it at upload or degrade during ingest. Fail-closed by contract.
 */
export async function parseFileToText(
  bytes: Uint8Array
): Promise<{ kind: FileKind; text: string }> {
  if (bytes.length === 0) throw new UnsupportedFile("empty file");
  if (bytes.length > MAX_FILE_BYTES) throw new UnsupportedFile("file exceeds the 50 MB limit");
  const kind = sniffFileKind(bytes);
  switch (kind) {
    case "pdf":
      return { kind, text: await parsePdf(bytes) };
    case "ooxml":
      return { kind, text: await parseOoxml(bytes) };
    case "text":
      return { kind, text: new TextDecoder().decode(bytes).slice(0, MAX_TEXT_OUT) };
    case "ole-legacy":
      throw new UnsupportedFile(LEGACY_OFFICE_MESSAGE);
    default:
      throw new UnsupportedFile("unsupported or unrecognized file type (content check failed)");
  }
}
