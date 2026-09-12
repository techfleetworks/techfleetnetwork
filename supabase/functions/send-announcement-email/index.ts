// @edge-cron
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

import { withAuditWrapper } from "../_shared/audit.ts";
import { fetchWithTimeout } from "../_shared/fetch-timeout.ts";
import { requireMarketingAttestation } from "./attestation.ts";
import { renderAnnouncementEmail } from "../_shared/email/announcement-render.ts";
// CORS from the shared owner so the preflight allows x-trace-id (invokeEdge attaches it);
// an inline block that omits it makes the browser block the POST. See supabase/functions/CLAUDE.md.
import { corsHeaders } from "../_shared/http.ts";

// test_recipients: admin-only delivery test. When present, the announcement is
// enqueued to exactly those addresses (bypassing the member audience) and the
// Discord cross-post is skipped — so "does it actually deliver?" can be proven to
// a test inbox before the real 1:N broadcast.
const BodySchema = z
  .object({
    announcement_id: z.string().optional(),
    test_recipients: z.array(z.string()).max(50).optional(),
  })
  .passthrough();

Deno.serve(
  withAuditWrapper("send-announcement-email", async (req) => {
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
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();
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

      const _raw = await req.json().catch(() => ({}));
      const _parsed = BodySchema.safeParse(_raw);
      if (!_parsed.success) {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { announcement_id, test_recipients } = _parsed.data as {
        announcement_id?: string;
        test_recipients?: string[];
      };
      if (!announcement_id) {
        return new Response(JSON.stringify({ error: "announcement_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const testMode = Array.isArray(test_recipients) && test_recipients.length > 0;

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

      // PR 7: refuse to email an un-attested announcement. The admin must confirm this is a
      // service/platform update, not marketing (marketing goes through Email Octopus, ADR-0017).
      // Enforced server-side so a direct edge-function call cannot bypass the composer checkbox.
      const attestation = requireMarketingAttestation(_parsed.data);
      if (!attestation.ok) {
        return new Response(
          JSON.stringify({
            error:
              "Marketing attestation required: confirm this announcement is not marketing before sending.",
            code: attestation.error,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Record who attested + when (server-verified admin identity; the client cannot set these).
      // A test send does not re-stamp attestation (it is a delivery probe, not the broadcast).
      if (!testMode) {
        const { error: stampError } = await adminClient
          .from("announcements")
          .update({
            marketing_attested_at: new Date().toISOString(),
            marketing_attested_by: user.id,
          })
          .eq("id", announcement_id);
        // The attestation record is the sole persisted evidence of who confirmed
        // "not marketing" (ADR-0017). Make it a hard precondition of the broadcast
        // rather than swallowing the failure and emailing 1,400+ members anyway.
        if (stampError) {
          console.error("attestation stamp failed", { announcement_id, error: stampError });
          return new Response(JSON.stringify({ error: "Failed to record attestation" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Render once — the body is identical for every recipient, so the fan-out is
      // a single set-based INSERT in the DB rather than a per-recipient edge loop.
      const { subject, html, text } = renderAnnouncementEmail({
        announcementId: announcement_id,
        title: announcement.title,
        bodyHtml: announcement.body_html || "",
      });

      // Enqueue the WHOLE audience in one atomic statement. This is the fix for the
      // ~198/1579 under-reach: the old per-recipient loop did ~5 DB round-trips each
      // and the edge runtime killed it after ~200 recipients, so the rest were never
      // enqueued. enqueue_announcement_emails cannot partially complete.
      const { data: enqueueRows, error: enqueueError } = await adminClient.rpc(
        "enqueue_announcement_emails",
        {
          p_announcement_id: announcement_id,
          p_subject: subject,
          p_html: html,
          p_text: text,
          p_recipients: testMode ? test_recipients : null,
        }
      );

      if (enqueueError) {
        console.error("enqueue_announcement_emails failed:", enqueueError);
        return new Response(JSON.stringify({ error: "Failed to enqueue announcement" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const row = (Array.isArray(enqueueRows) ? enqueueRows[0] : enqueueRows) as
        { eligible_count?: number; enqueued_count?: number } | null | undefined;
      const eligible = Number(row?.eligible_count ?? 0);
      const enqueued = Number(row?.enqueued_count ?? 0);

      // Reach signal — surfaced in the response AND the audit trail. `eligible` is
      // the true audience size (would have read ~1579, not 198, on the failed send),
      // so a shrunken audience is now visible instead of silent.
      console.log("announcement enqueue result", {
        announcement_id,
        test_mode: testMode,
        eligible,
        enqueued,
        already_present: Math.max(eligible - enqueued, 0),
      });

      if (eligible === 0) {
        return new Response(
          JSON.stringify({
            sent: 0,
            eligible: 0,
            total_recipients: 0,
            test_mode: testMode,
            message: testMode ? "No valid test recipients" : "No opted-in recipients",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Cross-post to Discord #platform-updates channel (real broadcast only) ---
      // Gated on `enqueued > 0`: an idempotent re-run (e.g. the recovery re-send)
      // enqueues 0 new rows, and must NOT re-post — otherwise it fires a duplicate
      // mass @role ping to #platform-updates while sending no new email.
      let discordPosted = false;
      const platformWebhook = Deno.env.get("DISCORD_PLATFORM_UPDATES_WEBHOOK");
      if (!testMode && enqueued > 0 && platformWebhook) {
        try {
          const announcementUrl = `https://techfleet.network/updates?highlight=${announcement_id}`;
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
            .replace(/&#(\d+);/g, (_m: string, code: string) => String.fromCharCode(Number(code)))
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

          const discordRes = await fetchWithTimeout(platformWebhook, {
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
            const errText = await discordRes.text();
            console.warn(
              `Discord webhook failed [${discordRes.status}]: ${errText.substring(0, 300)}`
            );
          }
          // Consume body if not already
          if (!discordPosted) await discordRes.text().catch(() => {});
        } catch (discordErr) {
          console.warn("Discord cross-post failed (non-critical):", discordErr);
        }
      } else if (!testMode && enqueued > 0 && !platformWebhook) {
        console.warn(
          "DISCORD_PLATFORM_UPDATES_WEBHOOK not configured; skipping Discord cross-post"
        );
      }

      return new Response(
        JSON.stringify({
          sent: enqueued,
          eligible,
          total_recipients: eligible,
          test_mode: testMode,
          discord_posted: discordPosted,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      console.error("send-announcement-email error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  })
);
