/**
 * Safely strip HTML tags and return plain text.
 * Uses a shared DOMParser to avoid creating throwaway DOM elements.
 */
const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;

export function stripHtml(html: string): string {
  if (!html) return "";
  if (!parser) return html.replace(/<[^>]*>/g, "");
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent || "";
}
