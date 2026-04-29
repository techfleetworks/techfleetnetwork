import { getAdminClient } from "../_shared/admin-client.ts";
import { handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { requireAdminRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { parseSendAnnouncementEmailRequest, toPlainAnnouncementText } from "./validation.ts";

const log = createEdgeLogger("send-announcement-email");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAdminRequest(req);
    if (auth instanceof Response) return auth;

    const adminClient = getAdminClient();
    const parsed = parseSendAnnouncementEmailRequest(await parseJsonBody(req, 1024));
    if (parsed instanceof Response) return parsed;
    const { announcement_id } = parsed;

    // Fetch the announcement
    const { data: announcement, error: annError } = await adminClient
      .from("announcements")
      .select("title, body_html")
      .eq("id", announcement_id)
      .single();

    if (annError || !announcement) {
      return jsonResponse({ error: "Announcement not found" }, 404);
    }

    // Fetch opted-in profiles
    const { data: profiles, error: profError } = await adminClient
      .from("profiles")
      .select("email")
      .eq("notify_announcements", true)
      .neq("email", "");

    if (profError) {
      log.error("recipients", "Failed to fetch announcement recipients", undefined, profError);
      return jsonResponse({ error: "Failed to fetch recipients" }, 500);
    }

    const recipients = (profiles ?? []).filter((p: any) => p.email);

    if (recipients.length === 0) {
      return jsonResponse({ sent: 0, message: "No opted-in recipients" });
    }

    // Enqueue emails for each recipient
    let enqueued = 0;
    const now = new Date().toISOString();

    for (const recipient of recipients) {
      const normalizedEmail = String(recipient.email ?? "").trim().toLowerCase();
      if (!normalizedEmail) continue;

      const messageId = `announcement-${announcement_id}-${crypto.randomUUID()}`;
      const unsubscribeToken = crypto.randomUUID();

      const announcementUrl = `https://techfleetnetwork.lovable.app/updates?highlight=${announcement_id}`;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e4e4e7;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">Tech Fleet Announcement</h1>
      </div>
      <h2 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px 0;">${announcement.title}</h2>
      <div style="font-size: 15px; line-height: 1.6; color: #3f3f46;">
        ${announcement.body_html}
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
      const emailText = [
        `Tech Fleet Announcement`,
        '',
        announcement.title,
        '',
        'A new announcement is available in Tech Fleet Network.',
        `View it here: ${announcementUrl}`,
        '',
        'You received this because you opted in to announcements.',
        'To unsubscribe, update your notification preferences in your profile settings.',
      ].join('\n');

      try {
        await adminClient.from("email_unsubscribe_tokens").insert({
          email: normalizedEmail,
          token: unsubscribeToken,
        });

        await adminClient.from("email_send_log").insert({
          message_id: messageId,
          recipient_email: normalizedEmail,
          template_name: "announcement",
          status: "pending",
          metadata: { announcement_id, title: announcement.title },
        });

        await adminClient.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to: normalizedEmail,
            subject: `[Tech Fleet] ${announcement.title}`,
            html: emailHtml,
            text: emailText,
            from: `Tech Fleet <notifications@notify.techfleet.org>`,
            sender_domain: "notify.techfleet.org",
            label: "announcement",
            message_id: messageId,
            idempotency_key: messageId,
            unsubscribe_token: unsubscribeToken,
            queued_at: now,
            purpose: "transactional",
          },
        });
        enqueued++;
      } catch (e) {
        log.error("enqueue", "Failed to enqueue announcement email", { announcementId: announcement_id }, e);
      }
    }

    // --- Cross-post to Discord #platform-updates channel ---
    let discordPosted = false;
    const platformWebhook = Deno.env.get("DISCORD_PLATFORM_UPDATES_WEBHOOK");
    if (platformWebhook) {
      try {
        const announcementUrl = `https://techfleetnetwork.lovable.app/updates?highlight=${announcement_id}`;
        // Strip HTML tags and decode entities for Discord plain-text
        const plainBody = announcement.body_html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<\/li>/gi, "\n")
          .replace(/<li[^>]*>/gi, "• ")
          .replace(/<\/h[1-6]>/gi, "\n\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        const discordContent = [
          `<@&1083439364975112293>`,
          "",
          `📢 **${announcement.title}**`,
          "",
          plainBody.length > 1500 ? plainBody.substring(0, 1500) + "…" : plainBody,
          "",
          `🔗 [View on Tech Fleet Network](${announcementUrl})`,
        ].join("\n");

        const discordRes = await fetch(platformWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: discordContent,
            allowed_mentions: { roles: ["1083439364975112293"] },
          }),
        });

        if (discordRes.ok) {
          discordPosted = true;
        } else {
          await discordRes.text();
          log.warn("discord", "Discord announcement cross-post failed", { status: discordRes.status, announcementId: announcement_id });
        }
        // Consume body if not already
        if (!discordPosted) await discordRes.text().catch(() => {});
      } catch (discordErr) {
        log.warn("discord", "Discord announcement cross-post failed", { announcementId: announcement_id }, discordErr);
      }
    } else {
      log.warn("discord", "Discord platform updates webhook not configured", { announcementId: announcement_id });
    }

    return jsonResponse({
      sent: enqueued,
      total_recipients: recipients.length,
      discord_posted: discordPosted,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("handler", "Announcement email send failed", undefined, err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
