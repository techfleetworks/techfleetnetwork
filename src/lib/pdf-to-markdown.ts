/**
 * Browser-side PDF → structured markdown extractor for workshop documents.
 *
 * Uses pdfjs-dist to pull text spans out of each page, then heuristically
 * groups them into paragraphs and headings. Output is intentionally
 * markdown so admins can preview, edit, and trust what gets sent into
 * Fleety's knowledge base.
 *
 * Design notes:
 * - We deliberately avoid the worker entry to keep the bundle simple and
 *   to dodge cross-origin worker issues in the Lovable preview iframe.
 *   pdfjs falls back to fake-worker mode (slower but reliable for the
 *   one-off admin import flow this serves).
 * - Headings are inferred from font-size jumps relative to the modal
 *   body size on each page — this catches "Step 1", "Goals", etc.
 * - We hard-cap output length to keep the request body sane.
 */

import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error - workerSrc is set to disable real worker for iframe safety
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

const MAX_OUTPUT_CHARS = 80_000;

interface TextItemLike {
  str: string;
  height: number;
  transform: number[];
}

/** Round to 1 decimal so near-equal sizes coalesce into the same bucket. */
const bucket = (n: number) => Math.round(n * 10) / 10;

/**
 * Extract structured markdown from a PDF File. Throws on parse error.
 */
export async function extractMarkdownFromPdf(file: File): Promise<{
  title: string;
  markdown: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    disableWorker: true,
    isEvalSupported: false,
  }).promise;

  // First pass: gather all font sizes across the document to identify the body size
  const sizeCounts = new Map<number, number>();
  const pageItems: TextItemLike[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItemLike[]).filter(
      (it) => typeof it.str === "string",
    );
    pageItems.push(items);
    for (const it of items) {
      if (!it.str.trim()) continue;
      const size = bucket(it.height);
      if (size > 0) sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
    }
  }

  // Body size = most common bucket
  let bodySize = 10;
  let maxCount = 0;
  for (const [size, count] of sizeCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bodySize = size;
    }
  }

  // Heading thresholds relative to body
  const h1Min = bodySize * 1.6;
  const h2Min = bodySize * 1.3;
  const h3Min = bodySize * 1.1;

  let inferredTitle = file.name.replace(/\.pdf$/i, "");
  let titleFound = false;
  const lines: string[] = [];

  for (let pIdx = 0; pIdx < pageItems.length; pIdx++) {
    const items = pageItems[pIdx];
    if (items.length === 0) continue;

    // Group items into visual lines by Y coordinate
    type Line = { y: number; size: number; text: string };
    const lineMap = new Map<number, Line>();

    for (const it of items) {
      const text = it.str;
      if (!text.trim() && text !== " ") continue;
      const y = Math.round(it.transform[5]); // 1-pt resolution; vertical
      const size = bucket(it.height);
      const existing = lineMap.get(y);
      if (existing) {
        existing.text += text;
        existing.size = Math.max(existing.size, size);
      } else {
        lineMap.set(y, { y, size, text });
      }
    }

    const sortedLines = [...lineMap.values()].sort((a, b) => b.y - a.y);

    for (const line of sortedLines) {
      const cleaned = line.text.replace(/\s+/g, " ").trim();
      if (!cleaned) {
        // Preserve a paragraph break
        if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
        continue;
      }

      // Capture the very first sizeable line as the workshop title
      if (!titleFound && line.size >= h2Min && cleaned.length > 3) {
        inferredTitle = cleaned;
        titleFound = true;
        lines.push(`# ${cleaned}`, "");
        continue;
      }

      let prefix = "";
      if (line.size >= h1Min) prefix = "## ";
      else if (line.size >= h2Min) prefix = "## ";
      else if (line.size >= h3Min) prefix = "### ";

      // Detect bullet-ish list items
      const looksLikeBullet = /^([•●▪◦○\-*]|(\d+[.)]))\s+/.test(cleaned);
      if (looksLikeBullet) {
        const stripped = cleaned.replace(/^([•●▪◦○\-*]|\d+[.)])\s+/, "");
        lines.push(`- ${stripped}`);
      } else if (prefix) {
        if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
        lines.push(`${prefix}${cleaned}`, "");
      } else {
        lines.push(cleaned);
      }
    }

    // Page separator — encourages paragraph break between pages
    lines.push("");
  }

  let markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (markdown.length > MAX_OUTPUT_CHARS) {
    markdown = markdown.substring(0, MAX_OUTPUT_CHARS) + "\n\n_[Truncated]_";
  }

  return { title: inferredTitle.trim() || file.name, markdown };
}
