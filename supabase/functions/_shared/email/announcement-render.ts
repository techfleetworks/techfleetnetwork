// Announcement email renderer — the SINGLE place the announcement HTML/text is built.
//
// Extracted from send-announcement-email/index.ts unchanged so the rendered
// output is byte-identical to what already shipped. It lives here (outside
// domain/ and application/) so BOTH callers use one renderer:
//   • send-announcement-email  (the edge function, steady-state send)
//   • enqueue_announcement_emails is passed the *rendered* html/text, so the
//     RPC never has to reproduce this transform in SQL.
//
// The body is identical for every recipient (the unsubscribe token rides the
// outbox payload, not the HTML), which is what lets the enqueue be a single
// set-based INSERT..SELECT instead of a per-recipient loop.

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"'()]+[^\s<>"'(),.;:!?])/gi;
const EMAIL_RE = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

const escHtml = (s: string) =>
  s
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function linkifyTextNode(text: string): string {
  type M = { start: number; end: number; html: string };
  const ms: M[] = [];
  const collect = (re: RegExp, build: (m: string) => string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null)
      ms.push({ start: m.index, end: m.index + m[0].length, html: build(m[0]) });
  };
  collect(URL_RE, (raw) => {
    const href = raw.startsWith("www.") ? `https://${raw}` : raw;
    return `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow">${escHtml(raw)}</a>`;
  });
  collect(EMAIL_RE, (raw) => `<a href="mailto:${escAttr(raw)}">${escHtml(raw)}</a>`);
  if (ms.length === 0) return escHtml(text);
  ms.sort((a, b) => a.start - b.start || a.end - b.end);
  const filtered: M[] = [];
  let lastEnd = -1;
  for (const m of ms) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  let out = "";
  let cursor = 0;
  for (const m of filtered) {
    out += escHtml(text.slice(cursor, m.start));
    out += m.html;
    cursor = m.end;
  }
  return out + escHtml(text.slice(cursor));
}

function linkifyHtml(html: string): string {
  if (typeof html !== "string" || !html) return "";
  let i = 0,
    out = "",
    inAnchor = 0;
  const len = html.length;
  while (i < len) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      const rest = html.slice(i);
      out += inAnchor > 0 ? rest : linkifyTextNode(rest);
      break;
    }
    if (lt > i) {
      const t = html.slice(i, lt);
      out += inAnchor > 0 ? t : linkifyTextNode(t);
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    const tag = html.slice(lt, gt + 1);
    out += tag;
    if (/^<a\b/i.test(tag)) inAnchor++;
    else if (/^<\/a\s*>/i.test(tag) && inAnchor > 0) inAnchor--;
    i = gt + 1;
  }
  return out;
}

export interface AnnouncementRenderInput {
  announcementId: string;
  title: string;
  bodyHtml: string;
}

export interface RenderedAnnouncement {
  subject: string;
  html: string;
  text: string;
}

/** Render the announcement into the subject/html/text the outbox payload carries. */
export function renderAnnouncementEmail(input: AnnouncementRenderInput): RenderedAnnouncement {
  const { announcementId, title, bodyHtml } = input;
  const announcementUrl = `https://techfleet.network/updates?highlight=${announcementId}`;

  // Inline styles into common block tags so email clients render formatting.
  // Many clients (Gmail, Outlook) strip <style> blocks or default browser
  // styles for <p>, <ul>, <ol>, <h2>, <h3>, <blockquote>, etc.
  const inlineFormattedBody = linkifyHtml(bodyHtml || "")
    .replace(
      /<p(\s[^>]*)?>/gi,
      '<p style="margin:0 0 12px 0; font-size:15px; line-height:1.6; color:#3f3f46;">'
    )
    .replace(
      /<h2(\s[^>]*)?>/gi,
      '<h2 style="font-size:18px; font-weight:700; color:#18181b; margin:20px 0 10px 0; line-height:1.3;">'
    )
    .replace(
      /<h3(\s[^>]*)?>/gi,
      '<h3 style="font-size:16px; font-weight:600; color:#18181b; margin:18px 0 8px 0; line-height:1.3;">'
    )
    .replace(
      /<ul(\s[^>]*)?>/gi,
      '<ul style="margin:0 0 12px 0; padding-left:24px; font-size:15px; line-height:1.6; color:#3f3f46;">'
    )
    .replace(
      /<ol(\s[^>]*)?>/gi,
      '<ol style="margin:0 0 12px 0; padding-left:24px; font-size:15px; line-height:1.6; color:#3f3f46;">'
    )
    .replace(/<li(\s[^>]*)?>/gi, '<li style="margin:0 0 4px 0;">')
    .replace(
      /<blockquote(\s[^>]*)?>/gi,
      '<blockquote style="margin:0 0 12px 0; padding:8px 16px; border-left:4px solid #e4e4e7; color:#52525b; font-style:italic;">'
    )
    .replace(/<a(\s[^>]*)?>/gi, (m: string) =>
      m.replace(/<a/i, '<a style="color:#2563eb; text-decoration:underline;"')
    )
    .replace(/<strong(\s[^>]*)?>/gi, '<strong style="font-weight:700; color:#18181b;">')
    .replace(/<b(\s[^>]*)?>/gi, '<b style="font-weight:700; color:#18181b;">')
    .replace(/<em(\s[^>]*)?>/gi, '<em style="font-style:italic;">')
    .replace(/<u(\s[^>]*)?>/gi, '<u style="text-decoration:underline;">');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e4e4e7;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">Tech Fleet Announcement</h1>
      </div>
      <h2 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px 0;">${escHtml(title)}</h2>
      <div style="font-size: 15px; line-height: 1.6; color: #3f3f46;">
        ${inlineFormattedBody}
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${announcementUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Announcement</a>
      </div>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
      <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 0;">
        You received this because you opted in to announcements on Tech Fleet Network.<br/>
        To unsubscribe, update your notification preferences in your profile settings.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Tech Fleet Announcement`,
    "",
    title,
    "",
    "A new announcement is available in Tech Fleet Network.",
    `View it here: ${announcementUrl}`,
    "",
    "You received this because you opted in to announcements.",
    "To unsubscribe, update your notification preferences in your profile settings.",
  ].join("\n");

  return { subject: `[Tech Fleet] ${title}`, html, text };
}
