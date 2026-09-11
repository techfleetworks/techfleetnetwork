// Module: supabase/functions/_shared/email/announcement-render (bdd-gate coverage marker)
// The announcement body is rendered ONCE and is identical for every recipient —
// that invariant is what lets the enqueue be a single set-based INSERT. These
// tests pin the contract (stable output, escaped title, linkified body).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderAnnouncementEmail } from "./announcement-render.ts";

Deno.test("subject is the [Tech Fleet] <title> form", () => {
  const { subject } = renderAnnouncementEmail({
    announcementId: "ann-1",
    title: "Dev Info Session",
    bodyHtml: "<p>Hi</p>",
  });
  assertEquals(subject, "[Tech Fleet] Dev Info Session");
});

Deno.test("html + text carry the highlight deep-link for the announcement", () => {
  const { html, text } = renderAnnouncementEmail({
    announcementId: "abc-123",
    title: "T",
    bodyHtml: "<p>body</p>",
  });
  assert(html.includes("updates?highlight=abc-123"));
  assert(text.includes("updates?highlight=abc-123"));
  assert(text.includes("T"));
});

Deno.test("title is HTML-escaped (no injection into the heading)", () => {
  const { html } = renderAnnouncementEmail({
    announcementId: "ann-1",
    title: "<script>alert(1)</script>",
    bodyHtml: "<p>x</p>",
  });
  assert(!html.includes("<script>alert(1)</script>"));
  assert(html.includes("&lt;script&gt;"));
});

Deno.test("bare URLs in the body are linkified", () => {
  const { html } = renderAnnouncementEmail({
    announcementId: "ann-1",
    title: "T",
    bodyHtml: "<p>Register at https://techfleet.network/rsvp today</p>",
  });
  assert(html.includes('href="https://techfleet.network/rsvp"'));
});

Deno.test("render is deterministic for identical input (safe to fan out set-based)", () => {
  const input = { announcementId: "ann-9", title: "Repeatable", bodyHtml: "<p>same</p>" };
  const a = renderAnnouncementEmail(input);
  const b = renderAnnouncementEmail(input);
  assertEquals(a, b);
});
