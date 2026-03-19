import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { announcement_id } = await req.json();
    if (!announcement_id) {
      return new Response(JSON.stringify({ error: "announcement_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the announcement
    const { data: announcement, error: annError } = await adminClient
      .from("announcements")
      .select("title, body_html")
      .eq("id", announcement_id)
      .single();

    if (annError || !announcement) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch opted-in profiles
    const { data: profiles, error: profError } = await adminClient
      .from("profiles")
      .select("email")
      .eq("notify_announcements", true)
      .neq("email", "");

    if (profError) {
      console.error("Failed to fetch profiles:", profError);
      return new Response(JSON.stringify({ error: "Failed to fetch recipients" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients = (profiles ?? []).filter((p: any) => p.email);

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No opted-in recipients" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        console.error(`Failed to enqueue email to ${normalizedEmail}:`, e);
      }
    }

    return new Response(JSON.stringify({ sent: enqueued, total_recipients: recipients.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-announcement-email error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
