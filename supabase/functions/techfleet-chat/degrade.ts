/**
 * Graceful-degrade answer (ADR-0044).
 *
 * Rendered as a NORMAL streamed answer — never a dead error — when every generation model has failed
 * after retries. Accurate by construction: it only points at the real KB sources already retrieved
 * for THIS question, plus the standing fallbacks (search / Knowledge Base / office hours). It never
 * fabricates a substantive answer, so a provider outage degrades to something honest and useful
 * rather than either an error toast or a made-up reply.
 *
 * Pure (no I/O), kept in its own module so it is unit-tested (the handler that calls it is welded
 * into Deno.serve and cannot be).
 */
export function buildDegradeMarkdown(sourceUrls: string[]): string {
  const parts = [
    "I can't put together a full answer this second — I'm having trouble reaching my model. " +
      "I'll be back shortly. In the meantime, here's what should help:",
    "",
  ];
  // Defense in depth: only ever emit http(s) links, even though the caller already filters.
  const clean = sourceUrls.filter((u) => /^https?:\/\//i.test(u));
  if (clean.length > 0) {
    parts.push("**Knowledge Base pages related to your question:**");
    for (const u of clean) parts.push(`- ${u}`);
    parts.push("");
  }
  parts.push(
    "You can also use the **search bar** at the top, browse the **Knowledge Base**, or **book office hours**."
  );
  return parts.join("\n");
}
